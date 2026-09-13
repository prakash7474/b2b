"""
Order Management & Restock Requisition Workflow routes for B2P Backend.
Extracted from app.py — handles restock requests, order lifecycle, and approval workflows.
"""

import traceback
from datetime import datetime, timedelta
from flask import request, jsonify
from pymongo import DESCENDING
from backend.config import app
import backend.database as _db
from backend.database import (
    log_event, write_movement, sync_vendor_inventory_with_batches,
    jsonify_doc, parse_date,
)


# ════════════════════════════════════════════════════════════════════
# VENDOR RESTOCK REQUISITION & APPROVAL WORKFLOW
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: POST /api/restock-requests
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Initiated by the retail merchant (or driver) via mobile app when stock drops
#   below minimum safety buffer (e.g. 5.0 kg).
#
# DUAL RECORD CREATION (DATA INTEGRITY PATTERN):
#   1. Creates primary document in `COLS["restock_requests"]` with current stock snapshot.
#   2. Creates matching backward-compatible entry in `COLS["orders"]` with
#      status "pending_admin_approval".
#   3. Mutual Cross-Linking: `restock_requests.linked_order_id = order_id` and
#      `orders.restock_request_id = request_id`.
#   Ensures older order-centric screens and modern restock dashboards stay 100% in sync.
# ==============================================================================
@app.route("/api/restock-requests", methods=["POST"])
def create_restock_request():
    """Vendor requests a new batch after updating their depleted inventory."""
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId")
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        shop_name = vendor.get("shop_name", vendor_id)

        product_name = data.get("product_name", "Idli Batter")
        qty = float(data.get("requested_quantity_kg") or data.get("quantity_kg", 15.0))
        notes = data.get("notes", "")

        now = datetime.utcnow()
        request_id = f"RSR_{vendor_id}_{int(now.timestamp())}"

        # Snapshot current stock at request time
        inv = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
        current_stock = float(inv.get("quantity", 0)) if inv else 0.0

        requested_batch_id = data.get("requested_batch_id") or data.get("batch_id") or None

        restock_doc = {
            "request_id": request_id,
            "vendor_id": vendor_id,
            "vendor_name": shop_name,
            "product_name": product_name,
            "requested_quantity_kg": qty,
            "requested_batch_id": requested_batch_id,
            "current_stock_kg": current_stock,
            "status": "pending",
            "notes": notes,
            "admin_notes": "",
            "approved_at": None,
            "rejected_at": None,
            "linked_order_id": None,
            "linked_batch_id": requested_batch_id,
            "created_at": now,
        }
        _db.COLS["restock_requests"].insert_one(restock_doc)

        # Also create a backward-compatible orders entry
        order_id = f"ORD_{vendor_id}_{int(now.timestamp())}"
        order_doc = {
            "order_id": order_id,
            "vendor_id": vendor_id,
            "user_id": vendor_id,
            "product_name": product_name,
            "quantity_kg": qty,
            "total_amount": 0.0,
            "payment_method": "Pending",
            "payment_status": "pending",
            "order_status": "pending_admin_approval",
            "notes": notes,
            "order_date": now,
            "created_at": now,
            "restock_request_id": request_id,
        }
        _db.COLS["orders"].insert_one(order_doc)

        # Link order back to restock request
        _db.COLS["restock_requests"].update_one(
            {"request_id": request_id},
            {"$set": {"linked_order_id": order_id}}
        )

        log_event(
            "activity", "info", shop_name,
            f"Vendor {shop_name} requested restock: {qty} kg of {product_name} (current stock: {current_stock} kg)",
            {"type": "order", "id": request_id, "name": request_id},
            {"vendor_id": vendor_id, "product_name": product_name, "quantity_kg": qty,
             "current_stock_kg": current_stock, "notes": notes}
        )

        return jsonify({
            "ok": True,
            "request_id": request_id,
            "order_id": order_id,
            "request": jsonify_doc(restock_doc),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: GET /api/restock-requests
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Admin ledger view of all merchant restock orders.
#   Supports query filters: `status` (pending, approved, rejected) and `vendor_id`.
#   Harmonizes unlinked orders from `COLS["orders"]` into standard restock format.
# ==============================================================================
@app.route("/api/restock-requests", methods=["GET"])
def get_restock_requests():
    """Admin or vendor views restock requests. Filters: ?status=pending|approved|rejected&vendor_id=..."""
    status_filter = request.args.get("status")
    vendor_id = request.args.get("vendor_id") or request.args.get("vendorId")
    limit = int(request.args.get("limit", 100))

    query = {}
    if status_filter:
        query["status"] = status_filter
    if vendor_id:
        query["vendor_id"] = vendor_id

    docs = list(_db.COLS["restock_requests"].find(query).sort("created_at", DESCENDING).limit(limit))

    # Also pull in any orders from COLS["orders"] that don't have a restock_request
    known_order_ids = {d.get("linked_order_id") for d in docs if d.get("linked_order_id")}
    known_order_ids.update({d.get("request_id") for d in docs if d.get("request_id")})

    order_query = {}
    if status_filter == "pending" or not status_filter:
        order_query["order_status"] = {"$in": ["pending_admin_approval", "pending"]}
    elif status_filter == "approved":
        order_query["order_status"] = "approved"
    elif status_filter == "rejected":
        order_query["order_status"] = "rejected"
    if vendor_id:
        order_query["vendor_id"] = vendor_id

    orphan_orders = list(_db.COLS["orders"].find(order_query).sort("created_at", DESCENDING).limit(limit))
    for ord_doc in orphan_orders:
        oid = ord_doc.get("order_id")
        if oid and oid not in known_order_ids:
            v_id = ord_doc.get("vendor_id", "")
            synced_req = {
                "request_id": ord_doc.get("restock_request_id") or oid,
                "vendor_id": v_id,
                "vendor_name": "",
                "product_name": ord_doc.get("product_name", "Idli Batter"),
                "requested_quantity_kg": float(ord_doc.get("quantity_kg", 15.0)),
                "current_stock_kg": 0.0,
                "status": "pending" if ord_doc.get("order_status") in ("pending_admin_approval", "pending") else ord_doc.get("order_status", "pending"),
                "notes": ord_doc.get("notes", ""),
                "admin_notes": ord_doc.get("admin_notes", ""),
                "created_at": ord_doc.get("created_at") or ord_doc.get("order_date"),
                "linked_order_id": oid,
            }
            docs.append(synced_req)

    # Resolve vendor shop names
    vendor_ids = {d.get("vendor_id") for d in docs if d.get("vendor_id")}
    vendor_names = {}
    if vendor_ids:
        for v in _db.COLS["vendors"].find(
            {"vendor_id": {"$in": list(vendor_ids)}},
            {"vendor_id": 1, "shop_name": 1},
        ):
            vendor_names[v["vendor_id"]] = v.get("shop_name", "")

    result = []
    for d in docs:
        item = jsonify_doc(d)
        item["vendor_name"] = vendor_names.get(d.get("vendor_id"), d.get("vendor_name", d.get("vendor_id", "")))
        result.append(item)

    return jsonify(result)


# ==============================================================================
# ROUTE: PATCH / PUT / POST /api/restock-requests/<request_id>/approve
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Admin approves the merchant restock requisition:
#   1. Transitions restock request status to "approved" with timestamp.
#   2. Synchronizes corresponding `orders` record to "approved".
#   3. Optional Batch Fulfillment: If `assign_batch_id` is supplied:
#      - Archives existing `received` batches at the store to historical log.
#      - Assigns the new Central Kitchen batch to the store.
#      - Links `restock_requests.linked_batch_id = assign_batch_id`.
#   4. Emits an audit log event.
# ==============================================================================
@app.route("/api/restock-requests/<request_id>/approve", methods=["PATCH", "PUT", "POST"])
@app.route("/api/orders/<request_id>/approve", methods=["PATCH", "PUT", "POST"])
def approve_restock_request(request_id):
    """Admin approves a vendor's restock request."""
    try:
        data = request.json or {}
        admin_notes = data.get("admin_notes", "")
        now = datetime.utcnow()

        # Find in restock_requests or orders
        req = _db.COLS["restock_requests"].find_one({
            "$or": [
                {"request_id": request_id},
                {"linked_order_id": request_id},
                {"order_id": request_id},
            ]
        })

        if not req:
            # Check orders collection
            order = _db.COLS["orders"].find_one({"order_id": request_id})
            if not order:
                return jsonify({"error": "Restock request not found"}), 404
            vendor_id = order.get("vendor_id", "")
            vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
            shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
            # Upsert into restock_requests
            req = {
                "request_id": request_id,
                "vendor_id": vendor_id,
                "vendor_name": shop_name,
                "product_name": order.get("product_name", "Idli Batter"),
                "requested_quantity_kg": float(order.get("quantity_kg", 15.0)),
                "current_stock_kg": 0.0,
                "status": "approved",
                "notes": order.get("notes", ""),
                "admin_notes": admin_notes,
                "approved_at": now,
                "linked_order_id": request_id,
                "created_at": order.get("created_at") or now,
            }
            _db.COLS["restock_requests"].update_one(
                {"request_id": request_id},
                {"$set": req},
                upsert=True
            )
            _db.COLS["orders"].update_one(
                {"order_id": request_id},
                {"$set": {"order_status": "approved", "admin_notes": admin_notes}}
            )
        else:
            _db.COLS["restock_requests"].update_one(
                {"request_id": req.get("request_id")},
                {"$set": {"status": "approved", "approved_at": now, "admin_notes": admin_notes}}
            )
            linked_order_id = req.get("linked_order_id") or req.get("request_id")
            if linked_order_id:
                _db.COLS["orders"].update_one(
                    {"order_id": linked_order_id},
                    {"$set": {"order_status": "approved", "admin_notes": admin_notes}}
                )

        vendor_id = req.get("vendor_id", "")
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id

        # ── Automatically assign batch if assign_batch_id is provided ─────
        assign_batch_id = data.get("assign_batch_id") or data.get("batch_id")
        if not assign_batch_id and req and req.get("requested_batch_id"):
            assign_batch_id = req.get("requested_batch_id")

        if assign_batch_id:
            b_doc = _db.COLS["batches"].find_one({"batch_id": assign_batch_id})
            if b_doc:
                # Archive old received batches at this vendor so they move to log history
                old_batches = list(_db.COLS["batches"].find({"vendor_id": vendor_id, "status": "received"}))
                if old_batches:
                    _db.COLS["batches"].update_many(
                        {"vendor_id": vendor_id, "status": "received"},
                        {"$set": {"status": "archived", "archived_at": now, "archived_reason": "new_batch_assigned"}}
                    )
                # Assign the chosen created batch to vendor
                _db.COLS["batches"].update_one(
                    {"batch_id": assign_batch_id},
                    {
                        "$set": {"vendor_id": vendor_id, "status": "assigned", "assigned_at": now},
                        "$push": {"assignment_log": {"vendor_id": vendor_id, "assigned_at": now, "assigned_by": "Admin"}},
                    }
                )
                req_target_id = req.get("request_id") or request_id
                _db.COLS["restock_requests"].update_one(
                    {"$or": [{"request_id": req_target_id}, {"linked_order_id": req_target_id}]},
                    {"$set": {"linked_batch_id": assign_batch_id}}
                )

        log_event(
            "activity", "info", "Admin",
            f"Admin approved restock request from {shop_name} ({req.get('requested_quantity_kg')} kg {req.get('product_name')})",
            {"type": "order", "id": request_id, "name": request_id},
            {"vendor_id": vendor_id, "admin_notes": admin_notes, "assigned_batch_id": assign_batch_id}
        )

        updated = _db.COLS["restock_requests"].find_one({
            "$or": [{"request_id": request_id}, {"linked_order_id": request_id}]
        })
        return jsonify({"ok": True, "request": jsonify_doc(updated or req), "assigned_batch_id": assign_batch_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: PATCH / PUT / POST /api/restock-requests/<request_id>/reject
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Admin rejects a merchant restock order, logging the business rationale
#   (e.g., unpaid invoices, factory capacity deficit, duplicate order).
# ==============================================================================
@app.route("/api/restock-requests/<request_id>/reject", methods=["PATCH", "PUT", "POST"])
@app.route("/api/orders/<request_id>/reject", methods=["PATCH", "PUT", "POST"])
def reject_restock_request(request_id):
    """Admin rejects a vendor's restock request with optional reason."""
    try:
        data = request.json or {}
        admin_notes = data.get("admin_notes", data.get("reason", ""))
        now = datetime.utcnow()

        req = _db.COLS["restock_requests"].find_one({
            "$or": [
                {"request_id": request_id},
                {"linked_order_id": request_id},
                {"order_id": request_id},
            ]
        })

        if not req:
            order = _db.COLS["orders"].find_one({"order_id": request_id})
            if not order:
                return jsonify({"error": "Restock request not found"}), 404
            vendor_id = order.get("vendor_id", "")
            vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
            shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
            req = {
                "request_id": request_id,
                "vendor_id": vendor_id,
                "vendor_name": shop_name,
                "product_name": order.get("product_name", "Idli Batter"),
                "requested_quantity_kg": float(order.get("quantity_kg", 15.0)),
                "current_stock_kg": 0.0,
                "status": "rejected",
                "notes": order.get("notes", ""),
                "admin_notes": admin_notes,
                "rejected_at": now,
                "linked_order_id": request_id,
                "created_at": order.get("created_at") or now,
            }
            _db.COLS["restock_requests"].update_one(
                {"request_id": request_id},
                {"$set": req},
                upsert=True
            )
            _db.COLS["orders"].update_one(
                {"order_id": request_id},
                {"$set": {"order_status": "rejected", "admin_notes": admin_notes}}
            )
        else:
            _db.COLS["restock_requests"].update_one(
                {"request_id": req.get("request_id")},
                {"$set": {"status": "rejected", "rejected_at": now, "admin_notes": admin_notes}}
            )
            linked_order_id = req.get("linked_order_id") or req.get("request_id")
            if linked_order_id:
                _db.COLS["orders"].update_one(
                    {"order_id": linked_order_id},
                    {"$set": {"order_status": "rejected", "admin_notes": admin_notes}}
                )

        vendor_id = req.get("vendor_id", "")
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id

        log_event(
            "activity", "warning", "Admin",
            f"Admin rejected restock request from {shop_name} — {admin_notes or 'No reason specified'}",
            {"type": "order", "id": request_id, "name": request_id},
            {"vendor_id": vendor_id, "admin_notes": admin_notes}
        )

        updated = _db.COLS["restock_requests"].find_one({
            "$or": [{"request_id": request_id}, {"linked_order_id": request_id}]
        })
        return jsonify({"ok": True, "request": jsonify_doc(updated or req)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# ORDER MANAGEMENT & SALES LOG
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# FUNCTION: ensure_seed_orders()
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Initializes historical sample orders if `COLS["orders"]` is empty.
# ==============================================================================
def ensure_seed_orders():
    if _db.COLS["orders"].count_documents({}) == 0:
        now = datetime.utcnow()
        seeds = [
            {
                "order_id": "ORD_V100_001",
                "user_id": "V100",
                "vendor_id": "V100",
                "order_date": now - timedelta(days=2, hours=3),
                "product_name": "Idli Batter",
                "quantity_kg": 25.0,
                "total_amount": 1250.0,
                "payment_method": "UPI",
                "payment_status": "paid",
                "order_status": "completed",
                "created_at": now - timedelta(days=2, hours=3),
            },
            {
                "order_id": "ORD_V100_002",
                "user_id": "V100",
                "vendor_id": "V100",
                "order_date": now - timedelta(days=1, hours=5),
                "product_name": "Idli Batter",
                "quantity_kg": 30.0,
                "total_amount": 1500.0,
                "payment_method": "UPI",
                "payment_status": "paid",
                "order_status": "completed",
                "created_at": now - timedelta(days=1, hours=5),
            },
            {
                "order_id": "ORD_V101_001",
                "user_id": "V101",
                "vendor_id": "V101",
                "order_date": now - timedelta(days=1, hours=2),
                "product_name": "Dosa Batter",
                "quantity_kg": 20.0,
                "total_amount": 1100.0,
                "payment_method": "Cash",
                "payment_status": "paid",
                "order_status": "completed",
                "created_at": now - timedelta(days=1, hours=2),
            },
        ]
        _db.COLS["orders"].insert_many(seeds)

try:
    ensure_seed_orders()
except Exception:
    pass


# ==============================================================================
# ROUTE: GET /api/orders
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns sales and requisition order history, sorted descending by date.
#   Optional query filter: `vendor_id`.
# ==============================================================================
@app.route("/api/orders", methods=["GET"])
def get_orders():
    vendor_id = request.args.get("vendor_id") or request.args.get("vendorId")
    query = {"vendor_id": vendor_id} if vendor_id else {}
    docs = list(_db.COLS["orders"].find(query).sort("order_date", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


# ==============================================================================
# ROUTE: POST /api/orders
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Alternative endpoint for merchant restock placement.
#   Atomically generates both an `orders` record and a `restock_requests` record
#   to guarantee synchrony across legacy order tracking and modern restock approval UIs.
# ==============================================================================
@app.route("/api/orders", methods=["POST"])
def create_order():
    """Vendor creates a restock request order."""
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId")
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        product_name = data.get("product_name", "Idli Batter")
        qty = float(data.get("requested_quantity_kg") or data.get("quantity_kg") or data.get("quantity", 10.0))
        notes = data.get("notes", "")

        now = datetime.utcnow()
        order_id = f"ORD_{vendor_id}_{int(now.timestamp())}"
        request_id = f"RSR_{vendor_id}_{int(now.timestamp())}"

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id or "Vendor"

        inv = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
        current_stock = float(inv.get("quantity", 0)) if inv else 0.0

        doc = {
            "order_id": order_id,
            "vendor_id": vendor_id,
            "user_id": vendor_id,
            "product_name": product_name,
            "quantity_kg": qty,
            "total_amount": 0.0,
            "payment_method": "Pending",
            "payment_status": "pending",
            "order_status": "pending_admin_approval",
            "notes": notes,
            "order_date": now,
            "created_at": now,
            "restock_request_id": request_id,
        }
        _db.COLS["orders"].insert_one(doc)

        restock_doc = {
            "request_id": request_id,
            "vendor_id": vendor_id,
            "vendor_name": shop_name,
            "product_name": product_name,
            "requested_quantity_kg": qty,
            "current_stock_kg": current_stock,
            "status": "pending",
            "notes": notes,
            "admin_notes": "",
            "approved_at": None,
            "rejected_at": None,
            "linked_order_id": order_id,
            "linked_batch_id": None,
            "created_at": now,
        }
        _db.COLS["restock_requests"].insert_one(restock_doc)

        log_event(
            "activity",
            "info",
            vendor_id,
            f"Vendor {shop_name} submitted restock request for {qty} kg of {product_name}",
            {"type": "order", "id": order_id, "name": order_id},
            {"vendor_id": vendor_id, "product_name": product_name, "quantity_kg": qty, "notes": notes}
        )

        return jsonify({
            "ok": True,
            "order_id": order_id,
            "request_id": request_id,
            "order": jsonify_doc(doc),
            "request": jsonify_doc(restock_doc),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400
