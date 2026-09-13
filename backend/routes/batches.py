"""
Batch Lifecycle Management routes for B2P Backend.
Extracted from app.py — handles the 4-stage batch lifecycle: Created -> Assigned -> Received -> Archived.
"""

import traceback
from datetime import datetime, timedelta
from flask import request, jsonify, session
from pymongo import DESCENDING
from bson import ObjectId
from backend.config import app
import backend.database as _db
from backend.database import (
    log_event, write_movement, sync_vendor_inventory_with_batches,
    jsonify_doc, parse_date,
)
from backend.services.constants import PRODUCT_NAME_TO_ID, safe_encode


# ════════════════════════════════════════════════════════════════════
# BATCH LIFECYCLE MANAGEMENT (4-STAGE FRESH SUPPLY CHAIN)
# ════════════════════════════════════════════════════════════════════
# LIFECYCLE STAGE MACHINE:
#   [1. CREATED]   Produced at Central Kitchen with initial QC (pH ~4.4, temp ~25°C).
#         │
#         ▼
#   [2. ASSIGNED]  Dispatched to delivery truck destined for a specific vendor shop.
#         │
#         ▼
#   [3. RECEIVED]  Arrived at vendor store, checked into on-hand retail shelf stock.
#         │
#         ▼
#   [4. ARCHIVED]  Depleted through customer sales (stockout) or spoiled/expired.
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: GET /api/batches
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Retrieves batches with flexible filtering:
#     - `vendor_id`: Filter by owning retail shop.
#     - `status`: "created", "assigned", "received", "archived", or "stockout".
#     - `include_archived`: Boolean flag (defaults to False for clean active UI).
#
# PERFORMANCE OPTIMIZATION:
#   Bulk-resolves vendor shop names using a single `$in` query instead of N individual queries.
# ==============================================================================
@app.route("/api/batches", methods=["GET"])
def get_batches():
    query = {}
    vendor_id = request.args.get("vendor_id")
    status = request.args.get("status")
    include_archived = request.args.get("include_archived", "false").lower() == "true"
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    elif vendor_id and not include_archived:
        query["status"] = {"$nin": ["archived", "stockout"]}
    docs = list(_db.COLS["batches"].find(query).sort("created_at", DESCENDING))
    # Resolve vendor shop names in one query (avoids N+1).
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
        item["vendor_name"] = vendor_names.get(d.get("vendor_id"), "")
        result.append(item)
    return jsonify(result)


# ==============================================================================
# ROUTE: GET /api/batches/available
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns all unassigned batches currently sitting in the Central Kitchen ready
#   to be dispatched (status="created" and vendor_id is None or empty).
# ==============================================================================
@app.route("/api/batches/available", methods=["GET"])
def get_available_batches():
    """Returns batches in the 'created' state that are not assigned to any vendor yet."""
    docs = list(_db.COLS["batches"].find({
        "status": "created",
        "$or": [
            {"vendor_id": None},
            {"vendor_id": ""},
            {"vendor_id": {"$exists": False}}
        ]
    }).sort("created_at", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


# ==============================================================================
# ROUTE: GET /api/batches/<batch_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns comprehensive telemetry and sensor data for an individual batch:
#   manufacturing timestamp, initial pH, ambient temperature, humidity,
#   and assigned merchant shop name.
# ==============================================================================
@app.route("/api/batches/<batch_id>", methods=["GET"])
def get_single_batch(batch_id):
    """Retrieve details of a single batch."""
    doc = _db.COLS["batches"].find_one({"batch_id": batch_id})
    if not doc:
        return jsonify({"error": "Batch not found"}), 404
    item = jsonify_doc(doc)
    if item.get("vendor_id"):
        vendor = _db.COLS["vendors"].find_one({"vendor_id": item["vendor_id"]})
        item["vendor_name"] = vendor.get("shop_name", "") if vendor else ""
    else:
        item["vendor_name"] = ""
    return jsonify(item)


# ==============================================================================
# ROUTE: POST /api/batches
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Logs a newly produced batch from the Central Kitchen into `COLS["batches"]`.
#
# INSTRUCTOR VIVA POINT — BIOLOGICAL QUALITY PARAMETERS:
#   - `initialPH`: Freshly ground fermented batter typically has an optimal pH of 4.2 - 4.6.
#     If initial pH is < 4.0, the batter is over-fermented/sour before dispatch.
#     If initial pH is > 5.2, fermentation has stalled.
#   - `fermentationHours`: Standard 8-12 hour incubation period.
#   - `temperatureC`: Factory ambient grinding temperature (typically 24°C - 28°C).
# ==============================================================================
@app.route("/api/batches", methods=["POST"])
def create_batch():
    """Admin creates a new batch with batter parameters."""
    try:
        data = request.json
        batch_id = data.get("batch_id", "").strip()
        if not batch_id:
            return jsonify({"error": "batch_id is required"}), 400
        if _db.COLS["batches"].find_one({"batch_id": batch_id}):
            return jsonify({"error": f"Batch {batch_id} already exists"}), 409

        mfg_ts = parse_date(data.get("mfgTimestamp") or data.get("mfg_timestamp") or datetime.utcnow().isoformat())
        doc = {
            "batch_id": batch_id,
            "product_name": data.get("product_name", "Idli Batter"),
            "manufacturer": data.get("manufacturer", "B2P Central Kitchen"),
            "batch_number": data.get("batch_number", batch_id),
            "mfgTimestamp": mfg_ts,             # canonical camelCase field
            "volume_kg": float(data.get("volume_kg", 1.0)),
            "initialPH": float(data.get("initialPH", 4.4)),
            "temperatureC": float(data.get("temperatureC", 25.0)),
            "humidityPct": float(data.get("humidityPct", 50.0)),
            "fermentationHours": float(data.get("fermentationHours", 8.0)),
            "notes": data.get("notes", ""),
            # Assignment lifecycle fields
            "vendor_id": "",
            "status": "created",       # created → assigned → received
            "assignment_log": [],      # append-only history of assignments
            "assigned_at": None,
            "received_at": None,
            "received_notes": "",
            "created_at": datetime.utcnow(),
        }
        _db.COLS["batches"].insert_one(doc)
        log_event("activity", "info", "Admin", f"Batch #{batch_id} produced ({doc['volume_kg']} kg, pH {doc['initialPH']})", {"type": "batch", "id": batch_id, "name": batch_id})
        return jsonify({"ok": True, "batch_id": batch_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: PUT / PATCH /api/batches/<batch_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Generic update endpoint for batch attributes or manual status adjustments.
# ==============================================================================
@app.route("/api/batches/<batch_id>", methods=["PUT", "PATCH"])
def update_batch(batch_id):
    """Admin updates batch (e.g., assign to vendor)."""
    try:
        data = request.json or {}
        update_fields = {}

        if "vendor_id" in data:
            vendor_id = data["vendor_id"]
            update_fields["vendor_id"] = vendor_id
            update_fields["status"] = "assigned"
            update_fields["assigned_at"] = datetime.utcnow()
            vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
            v_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
            log_event("activity", "info", "Admin", f"Batch #{batch_id} assigned to {v_name}", {"type": "batch", "id": batch_id, "name": batch_id})

        if "status" in data:
            update_fields["status"] = data["status"]

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        result = _db.COLS["batches"].update_one({"batch_id": batch_id}, {"$set": update_fields})
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: PUT / PATCH /api/batches/<batch_id>/assign
# ------------------------------------------------------------------------------
# WHAT THIS DOES (STAGE 2: CREATED -> ASSIGNED):
#   1. Admin dispatches an available batch to a partner store.
#   2. Transitions status from "created" -> "assigned" with UTC timestamp.
#   3. Appends an audit record to the batch's `assignment_log` array.
#   4. If this dispatch fulfills an open vendor restock request, automatically marks
#      that restock request as "approved" and links the batch ID.
#   5. Synchronizes vendor store inventory without archiving existing active batches!
# ==============================================================================
@app.route("/api/batches/<batch_id>/assign", methods=["PUT", "PATCH"])
def assign_batch(batch_id):
    """Admin assigns a batch to a vendor. Keeps existing active batches preserved."""
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        v_name = vendor.get("shop_name", vendor_id)
        now = datetime.utcnow()

        # NOTE: Adding/assigning a batch only adds to batches, never archives existing ones
        # ── Assign the new batch ─────────────────────────────────────
        result = _db.COLS["batches"].update_one(
            {"batch_id": batch_id},
            {
                "$set": {"vendor_id": vendor_id, "status": "assigned", "assigned_at": now},
                "$push": {"assignment_log": {"vendor_id": vendor_id, "assigned_at": now, "assigned_by": "Admin"}},
            }
        )
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404

        # ── Link and approve restock request if provided ─────────────
        restock_id = data.get("restock_request_id") or data.get("order_id")
        if restock_id:
            _db.COLS["restock_requests"].update_one(
                {"$or": [{"request_id": restock_id}, {"linked_order_id": restock_id}]},
                {"$set": {"status": "approved", "approved_at": now, "linked_batch_id": batch_id}}
            )
            _db.COLS["orders"].update_one(
                {"$or": [{"order_id": restock_id}, {"restock_request_id": restock_id}]},
                {"$set": {"order_status": "approved"}}
            )

        # Sync vendor inventory to reflect active batches
        sync_vendor_inventory_with_batches(vendor_id)

        log_event("activity", "info", "Admin", f"Batch #{batch_id} assigned to {v_name}", {"type": "batch", "id": batch_id, "name": batch_id})
        resp = {"ok": True, "vendor_id": vendor_id, "vendor_name": v_name, "archived_count": 0, "assigned_batch_id": batch_id}
        if restock_id:
            resp["restock_request_id"] = restock_id
        return jsonify(resp)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: PUT / PATCH /api/batches/<batch_id>/receive
# ------------------------------------------------------------------------------
# WHAT THIS DOES (STAGE 3: ASSIGNED -> RECEIVED):
#   1. Merchant confirms receipt when the delivery van arrives at their storefront.
#   2. Transitions batch status from "assigned" -> "received" (now in physical stock).
#   3. Calls `sync_vendor_inventory_with_batches` to recalculate total active kg.
#   4. Emits an immutable double-entry ledger event via `write_movement(movement_type="receive")`
#      with positive quantity and 24-hour expiry horizon.
# ==============================================================================
@app.route("/api/batches/<batch_id>/receive", methods=["PUT", "PATCH"])
def receive_batch(batch_id):
    """Confirm receipt of a batch (by vendor or admin on vendor's behalf)."""
    try:
        data = request.json or {}
        notes = data.get("notes", "")
        now = datetime.utcnow()

        batch = _db.COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        _db.COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "received", "received_at": now, "received_notes": notes}}
        )

        vendor_id = batch.get("vendor_id", "")
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        v_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
        qty = float(batch.get("volume_kg", batch.get("quantity_kg", 15.0)))
        product_name = batch.get("product_name", "Idli Batter")
        product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)

        log_event(
            "activity", "info", "Admin",
            f"Batch #{batch_id} marked received & stocked ({qty} kg) for {v_name}",
            {"type": "batch", "id": batch_id, "name": batch_id}
        )

        # Update inventory entry for this vendor to reflect sum of all active batches
        if vendor_id:
            inv = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
            prev_qty = float(inv.get("quantity", 0)) if inv else 0.0
            expiry_dt = now + timedelta(hours=24)
            updated_batch = {**batch, "status": "received"}
            new_qty, _ = sync_vendor_inventory_with_batches(vendor_id, new_batch=updated_batch)

            # Phase C: write inventory_movement event
            write_movement(
                vendor_id=vendor_id, product_id=product_id,
                movement_type="receive", quantity=qty,
                batch_id=batch_id,
                expiry_at=expiry_dt,
                triggered_by="admin",
                previous_qty=prev_qty, new_qty=new_qty,
                notes=f"Batch #{batch_id} received (inventory is {new_qty} kg)"
            )

        return jsonify({"ok": True, "batch_id": batch_id, "status": "received"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: DELETE /api/batches/<batch_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Deletes a batch and triggers inventory re-synchronization for the owner vendor.
# ==============================================================================
@app.route("/api/batches/<batch_id>", methods=["DELETE"])
def delete_batch(batch_id):
    try:
        b = _db.COLS["batches"].find_one({"batch_id": batch_id})
        if not b:
            return jsonify({"error": "Batch not found"}), 404
        vendor_id = b.get("vendor_id")
        _db.COLS["batches"].delete_one({"batch_id": batch_id})
        if vendor_id:
            sync_vendor_inventory_with_batches(vendor_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: POST / PUT / PATCH /api/batches/<batch_id>/stockout & /archive
# ------------------------------------------------------------------------------
# WHAT THIS DOES (STAGE 4: RECEIVED -> ARCHIVED / STOCKOUT):
#   1. When all units in a batch are sold out, vendor marks it depleted.
#   2. Transitions status from "received" -> "archived", sets `archived_reason="vendor_stockout"`.
#   3. Deducts batch volume from store inventory.
#   4. Emits a negative double-entry movement ledger record (`movement_type="stockout"`).
# ==============================================================================
@app.route("/api/batches/<batch_id>/stockout", methods=["POST", "PUT", "PATCH"])
@app.route("/api/batches/<batch_id>/archive", methods=["POST", "PUT", "PATCH"])
def mark_batch_stockout(batch_id):
    """Vendor or admin marks batch as stock out / depleted, archiving it and removing it from active store inventory."""
    try:
        batch = _db.COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        now = datetime.utcnow()
        vendor_id = batch.get("vendor_id", "")
        product_name = batch.get("product_name", "Idli Batter")
        product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)
        volume = float(batch.get("volume_kg", batch.get("quantity_kg", 0.0)))

        # Update batch status in batches collection to archived
        _db.COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {
                "status": "archived",
                "stocked_out_at": now,
                "archived_at": now,
                "archived_reason": "vendor_stockout",
                "remaining_volume_kg": 0.0,
            }}
        )

        # Update vendor active inventory in inventory collection
        if vendor_id:
            remaining_active = list(_db.COLS["batches"].find({
                "vendor_id": vendor_id,
                "status": "received",
                "batch_id": {"$ne": batch_id}
            }))
            inv = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
            prev_qty = float(inv.get("quantity", 0.0)) if inv else 0.0
            if not remaining_active:
                new_qty = 0.0
            else:
                new_qty = max(0.0, round(prev_qty - volume, 1))
            if inv:
                _db.COLS["inventory"].update_one(
                    {"vendor_id": vendor_id},
                    {"$set": {"quantity": new_qty, "last_updated": now}}
                )

            # Record inventory movement
            write_movement(
                vendor_id=vendor_id,
                product_id=product_id,
                movement_type="stockout",
                quantity=-volume,
                batch_id=batch_id,
                triggered_by="vendor",
                previous_qty=prev_qty,
                new_qty=new_qty,
                notes=f"Batch #{batch_id} marked as Stock Out and Archived"
            )

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id}) if vendor_id else None
        shop_name = vendor.get("shop_name", vendor_id) if vendor else "Vendor"
        log_event(
            "activity", "info", shop_name,
            f"Batch #{batch_id} marked as Stock Out & Archived (removed from active store) at {shop_name}",
            {"type": "batch", "id": batch_id, "name": batch_id}
        )

        return jsonify({
            "ok": True,
            "batch_id": batch_id,
            "status": "archived",
            "message": f"Batch #{batch_id} marked as Stock Out and archived"
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: POST /api/batches/<batch_id>/report-issue
# ------------------------------------------------------------------------------
# WHAT THIS DOES (QUALITY EXCEPTION & INCIDENT REPORTING):
#   Allows vendors or logistics handlers to report defects (e.g., container leakage,
#   excess acidity/bloating packaging, broken cold chain during transit).
#   Writes a high-priority warning alert into `COLS["logs"]` for admin investigation.
# ==============================================================================
@app.route("/api/batches/<batch_id>/report-issue", methods=["POST"])
def report_batch_issue(batch_id):
    """Vendor flags an issue with an assigned/received batch."""
    try:
        data = request.json or {}
        issue_type = data.get("issue_type", "other")
        description = data.get("description", "")
        vendor_id = data.get("vendor_id") or (session.get("user") or {}).get("vendor_id", "")

        batch = _db.COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id}) if vendor_id else None
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id or "Vendor"

        log_event(
            "alert",
            "warning",
            shop_name,
            f"Vendor {shop_name} flagged issue on Batch #{batch_id} ({issue_type}): {description}",
            {"type": "batch", "id": batch_id, "name": batch_id},
            {"issue_type": issue_type, "description": description, "vendor_id": vendor_id}
        )
        return jsonify({"ok": True, "message": "Issue report logged successfully"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400
