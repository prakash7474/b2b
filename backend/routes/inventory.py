"""
Inventory Management & Reconciliation routes for B2P Backend.
Extracted from app.py — handles inventory CRUD, stock mutation, vendor self-service updates, and movement ledger.
"""

import traceback
import random
from datetime import datetime, timedelta
from flask import request, jsonify
from pymongo import DESCENDING
from bson import ObjectId
from backend.config import app
import backend.database as _db
from backend.database import (
    log_event, write_movement, sync_vendor_inventory_with_batches,
    jsonify_doc, parse_date,
)
from backend.services.constants import PRODUCT_NAME_TO_ID


# ==============================================================================
# ROUTE: GET /api/inventory
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns active on-hand store inventory records.
#   Optional query filter `vendorId` / `vendor_id`.
#   Bulk-resolves vendor shop names to eliminate N+1 query latency.
# ==============================================================================
@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    query = {"vendor_id": vendor_id} if vendor_id else {}
    docs = list(_db.COLS["inventory"].find(query))

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
# ROUTE: GET /api/inventory/summary
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Provides a comprehensive real-time stock and freshness health summary for a vendor.
#
# CALCULATIONS & VIVA HIGHLIGHTS:
#   - `totalQuantityKg`: Sum of active `received` batches at the store.
#   - `minimumStockKg`: Minimum safety buffer threshold (defaults to 10.0 kg).
#   - `belowMinimum`: True if on-hand stock is lower than safety buffer.
#   - `isStockOut`: True if on-hand stock is 0 or no active batches exist.
#   - `oldestBatchAgeHrs`: Computes (now - mfgTimestamp) in hours for the oldest
#     batch on the shelf. Essential for monitoring spoilage vulnerability.
# ==============================================================================
@app.route("/api/inventory/summary", methods=["GET"])
def get_inventory_summary():
    """Return an aggregated inventory summary for dashboard display."""
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    if not vendor_id:
        return jsonify({"error": "vendor_id is required"}), 400

    now = datetime.utcnow()
    total_qty, active_batches = sync_vendor_inventory_with_batches(vendor_id)
    received_batches = [b for b in active_batches if b.get("status") == "received"]
    assigned_batches = [b for b in active_batches if b.get("status") == "assigned"]

    inv_items = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
    min_stock = sum(float(i.get("minimumStock") or i.get("minimum_stock", 0)) for i in inv_items)
    if min_stock == 0:
        min_stock = 10.0

    if not received_batches:
        avg_freshness = 0.0
        oldest_batch_age_hrs = 0.0
    else:
        freshness_scores = [float(i.get("freshnessScore") or i.get("freshness_score", 0.8)) for i in inv_items]
        avg_freshness = round(sum(freshness_scores) / len(freshness_scores), 2) if (freshness_scores and total_qty > 0) else 0.0
        oldest_batch_age_hrs = 0.0
        ages = []
        for b in received_batches:
            mfg = b.get("mfgTimestamp") or b.get("mfg_timestamp") or b.get("received_at") or b.get("created_at")
            if mfg:
                if isinstance(mfg, str):
                    mfg = parse_date(mfg)
                ages.append(max(0.0, (now - mfg).total_seconds() / 3600.0))
        if ages:
            oldest_batch_age_hrs = round(max(ages), 1)

    batch_count = len(assigned_batches)
    received_batch_count = len(received_batches)

    products = list(set(i.get("product_name", "Idli Batter") for i in inv_items)) or ["Idli Batter"]

    return jsonify({
        "vendorId": vendor_id,
        "totalQuantityKg": round(total_qty, 1),
        "minimumStockKg": round(min_stock, 1),
        "belowMinimum": total_qty < min_stock,
        "isStockOut": total_qty <= 0 or len(active_batches) == 0,
        "batchCount": batch_count,
        "receivedBatchCount": received_batch_count,
        "oldestBatchAgeHrs": oldest_batch_age_hrs,
        "freshnessScore": avg_freshness,
        "products": products
    })


# ==============================================================================
# ROUTE: POST / PATCH /api/inventory
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Central mutation endpoint for inventory operations:
#   1. Strict Governance: Arbitrary manual stock editing (`action="edit"`) is
#      explicitly blocked. Physical inventory can ONLY change through identifiable batches.
#   2. "remove_batches": Archives the specified batches, writes negative ledger
#      movements, and re-syncs active store stock.
#   3. "add_batch": Dispatches an unassigned batch from the Central Kitchen or creates
#      a new production batch assigned to the vendor, logging double-entry movements.
# ==============================================================================
@app.route("/api/inventory", methods=["POST", "PATCH"])
def mutate_inventory():
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId")
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        action = data.get("action", "edit")  # "add_batch", "remove_batch", "remove_batches"
        delta = float(data.get("quantity_delta", 0))
        new_qty = data.get("quantity")
        now = datetime.utcnow()

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id

        inv_items = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
        current_total = sum(float(i.get("quantity", 0)) for i in inv_items)
        product_name = data.get("product_name") or (inv_items[0].get("product_name") if inv_items else "Idli Batter") or "Idli Batter"
        product_id = PRODUCT_NAME_TO_ID.get(product_name, "Idly_Batter")

        batch_id_created = None

        # Disallow arbitrary direct overwrites to preserve double-entry audit integrity
        if action == "edit" or new_qty is not None:
            return jsonify({"error": "Direct inventory editing is disabled. Stock is managed strictly via batches."}), 400

        elif action in ["remove_batch", "remove_batches"]:
            batch_ids_to_remove = data.get("batch_ids") or []
            single_id = data.get("batch_id")
            if single_id and single_id not in batch_ids_to_remove:
                batch_ids_to_remove.append(single_id)

            if not batch_ids_to_remove:
                return jsonify({"error": "No batches specified to remove"}), 400

            # Match and archive batches for this vendor
            matched_batches = []
            for bid in batch_ids_to_remove:
                clean_id = str(bid).strip().lstrip("#")
                b_doc = None
                if ObjectId.is_valid(clean_id):
                    b_doc = _db.COLS["batches"].find_one({"_id": ObjectId(clean_id), "vendor_id": vendor_id})
                if not b_doc:
                    b_doc = _db.COLS["batches"].find_one({
                        "$or": [
                            {"batch_id": clean_id},
                            {"batch_number": clean_id},
                            {"batch_id": f"#{clean_id}"},
                            {"batch_number": f"#{clean_id}"}
                        ],
                        "vendor_id": vendor_id
                    })
                if b_doc:
                    matched_batches.append(b_doc)

            if not matched_batches:
                return jsonify({"error": "No matching active batches found for this vendor"}), 404

            removed_ids = []
            total_removed_kg = 0.0
            for b in matched_batches:
                b_ident = b.get("batch_id") or str(b.get("_id"))
                vol = float(b.get("volume_kg", b.get("quantity_kg", 0.0)))
                _db.COLS["batches"].update_one(
                    {"_id": b["_id"]},
                    {"$set": {
                        "status": "archived",
                        "archived_at": now,
                        "archived_reason": "removed_by_admin"
                    }}
                )
                removed_ids.append(b_ident)
                total_removed_kg += vol
                write_movement(
                    vendor_id=vendor_id,
                    product_id=PRODUCT_NAME_TO_ID.get(b.get("product_name", product_name), product_id),
                    movement_type="remove",
                    quantity=-vol,
                    batch_id=b_ident,
                    triggered_by="admin",
                    notes=f"Batch #{b_ident} removed from {shop_name} by admin"
                )

            # Sync inventory strictly with remaining active batches
            target_qty, _ = sync_vendor_inventory_with_batches(vendor_id)
            log_msg = f"Admin removed {len(removed_ids)} batch(es) ({removed_ids}) totaling {total_removed_kg} kg from {shop_name}"
            log_event("activity", "info", "Admin", log_msg, {"type": "vendor", "id": vendor_id, "name": shop_name})

            updated = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
            return jsonify({
                "ok": True,
                "inventory": [jsonify_doc(i) for i in updated],
                "totalQuantity": target_qty,
                "removedBatches": removed_ids
            })

        elif action == "add_batch":
            delta_val = abs(delta) if delta > 0 else 10.0
            specified_batch_id = (data.get("batch_id") or "").strip()
            existing_unassigned = None
            if specified_batch_id:
                existing_unassigned = _db.COLS["batches"].find_one({
                    "batch_id": specified_batch_id,
                    "status": "created",
                    "$or": [{"vendor_id": None}, {"vendor_id": ""}, {"vendor_id": {"$exists": False}}]
                })

            active_batch_doc = None
            if existing_unassigned:
                batch_id_created = existing_unassigned["batch_id"]
                actual_vol = delta_val if delta_val > 0 else float(existing_unassigned.get("volume_kg", 15.0))
                _db.COLS["batches"].update_one(
                    {"batch_id": batch_id_created},
                    {
                        "$set": {
                            "vendor_id": vendor_id,
                            "status": "assigned",
                            "assigned_at": now,
                            "volume_kg": actual_vol,
                            "quantity_kg": actual_vol,
                        },
                        "$push": {"assignment_log": {"vendor_id": vendor_id, "assigned_at": now, "assigned_by": "Admin"}}
                    }
                )
                active_batch_doc = {**existing_unassigned, "vendor_id": vendor_id, "status": "assigned", "volume_kg": actual_vol, "quantity_kg": actual_vol}
            else:
                batch_id_created = specified_batch_id or f"B{int(datetime.utcnow().timestamp()) % 100000:05d}"
                while _db.COLS["batches"].find_one({"batch_id": batch_id_created}):
                    batch_id_created = f"B{random.randint(10000, 99999)}"

                batch_doc = {
                    "batch_id": batch_id_created,
                    "batch_number": batch_id_created,
                    "product_name": product_name,
                    "manufacturer": data.get("manufacturer", "B2P Central Kitchen"),
                    "mfgTimestamp": now,
                    "volume_kg": delta_val,
                    "quantity_kg": delta_val,
                    "initialPH": float(data.get("initialPH", 4.4)),
                    "temperatureC": float(data.get("temperatureC", 26.5)),
                    "humidityPct": float(data.get("humidityPct", 58.0)),
                    "fermentationHours": float(data.get("fermentationHours", 8.0)),
                    "notes": data.get("notes", f"Assigned to {shop_name}"),
                    "vendor_id": vendor_id,
                    "status": "assigned",
                    "assignment_log": [{
                        "vendor_id": vendor_id,
                        "assigned_at": now,
                        "assigned_by": "Admin"
                    }],
                    "assigned_at": now,
                    "created_at": now,
                }
                _db.COLS["batches"].insert_one(batch_doc)
                active_batch_doc = batch_doc

            target_qty, _ = sync_vendor_inventory_with_batches(vendor_id, new_batch=active_batch_doc)
            log_msg = f"Admin added batch #{batch_id_created} ({delta_val} kg) assigned to {shop_name}"
            write_movement(
                vendor_id=vendor_id, product_id=product_id,
                movement_type="add", quantity=delta_val,
                batch_id=batch_id_created,
                triggered_by="admin",
                previous_qty=current_total, new_qty=target_qty,
                notes=log_msg
            )
            log_event("activity", "info", "Admin", log_msg, {"type": "vendor", "id": vendor_id, "name": shop_name})

            updated = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
            return jsonify({
                "ok": True,
                "inventory": [jsonify_doc(i) for i in updated],
                "totalQuantity": target_qty,
                "batch_id": batch_id_created
            })

        else:
            return jsonify({"error": f"Invalid action: {action}"}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: POST / PATCH /api/inventory/remove-batches & /api/batches/remove
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Convenience wrapper route redirecting to `mutate_inventory(action="remove_batches")`.
# ==============================================================================
@app.route("/api/inventory/remove-batches", methods=["POST", "PATCH"])
@app.route("/api/batches/remove", methods=["POST"])
def remove_batches_dedicated():
    """Dedicated endpoint to remove assigned batches from a vendor."""
    data = request.json or {}
    data["action"] = "remove_batches"
    return mutate_inventory()


# ════════════════════════════════════════════════════════════════════
# VENDOR MOBILE SELF-SERVICE STOCK UPDATE
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: PUT / POST /api/vendor/inventory/update
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Enables retail partner store owners to report their physical on-hand stock
#   directly from the React Native mobile app (e.g., after morning tiffin rush).
#
# BUSINESS WORKFLOW:
#   1. Merchant enters current remaining kg (e.g. 15 kg -> 3 kg).
#   2. Updates `COLS["inventory"]` with new quantity.
#   3. If remaining stock hits 0: marks active received batches as "stockout" / "archived".
#   4. Emits a signed delta movement to the ledger: `quantity = remaining - prev_qty`.
#   5. Evaluates threshold alerts:
#      - If remaining < minimumStock: flags `below_minimum=True`.
#      - If remaining <= 0: flags `is_stockout=True`.
#      Prompts the mobile app UI to trigger the Request Restock modal!
# ==============================================================================
@app.route("/api/vendor/inventory/update", methods=["PUT", "POST"])
def vendor_update_inventory():
    """Vendor updates their own remaining stock quantity (e.g. 15 kg → 3 kg after sales).

    Accepts: { vendor_id, remaining_quantity_kg }
    """
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId")
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        remaining = data.get("remaining_quantity_kg")
        if remaining is None:
            return jsonify({"error": "remaining_quantity_kg is required"}), 400
        remaining = max(0.0, float(remaining))

        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        shop_name = vendor.get("shop_name", vendor_id)

        now = datetime.utcnow()
        inv = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
        prev_qty = float(inv.get("quantity", 0)) if inv else 0.0
        product_name = inv.get("product_name", "Idli Batter") if inv else "Idli Batter"
        product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)
        min_stock = float(inv.get("minimumStock") or inv.get("minimum_stock", 5.0)) if inv else 5.0

        if inv:
            _db.COLS["inventory"].update_one(
                {"vendor_id": vendor_id},
                {"$set": {"quantity": remaining, "last_updated": now}}
            )
        else:
            _db.COLS["inventory"].insert_one({
                "inventory_id": f"INV_{vendor_id}",
                "vendor_id": vendor_id,
                "product_name": product_name,
                "quantity": remaining,
                "minimumStock": 5.0,
                "freshnessScore": 0.5,
                "receivedAt": now,
            })

        # If stock is completely depleted, transition active received batches to stockout
        if remaining == 0:
            _db.COLS["batches"].update_many(
                {"vendor_id": vendor_id, "status": "received"},
                {"$set": {"status": "stockout", "stocked_out_at": now, "remaining_volume_kg": 0.0}}
            )

        # Record inventory movement
        write_movement(
            vendor_id=vendor_id, product_id=product_id,
            movement_type="vendor_update", quantity=remaining - prev_qty,
            triggered_by="vendor",
            previous_qty=prev_qty, new_qty=remaining,
            notes=f"Vendor {shop_name} updated stock: {prev_qty} kg → {remaining} kg"
        )

        log_event(
            "activity", "info", shop_name,
            f"Vendor {shop_name} updated inventory: {prev_qty} kg → {remaining} kg",
            {"type": "vendor", "id": vendor_id, "name": shop_name},
            {"previous_qty": prev_qty, "new_qty": remaining}
        )

        below_minimum = remaining < min_stock
        is_stockout = remaining <= 0

        return jsonify({
            "ok": True,
            "vendor_id": vendor_id,
            "previous_quantity_kg": prev_qty,
            "remaining_quantity_kg": remaining,
            "below_minimum": below_minimum,
            "is_stockout": is_stockout,
            "minimum_stock_kg": min_stock,
            "message": (
                "Stock depleted — request a new batch." if is_stockout
                else f"Stock is low ({remaining} kg < {min_stock} kg minimum) — consider requesting a restock." if below_minimum
                else f"Stock updated to {remaining} kg."
            ),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# IMMUTABLE INVENTORY MOVEMENT AUDIT TRAIL
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: GET /api/inventory-movement
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Exposes the append-only double-entry inventory ledger (`COLS["inventory_movement"]`).
#   Tracks every addition (+), receipt (+), sale (-), removal (-), and stockout (-).
#   Provides strict auditability required for food safety and inventory accounting.
# ==============================================================================
@app.route("/api/inventory-movement", methods=["GET"])
def get_inventory_movement():
    """Return inventory movement history for a vendor or globally."""
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    limit = int(request.args.get("limit", 100))
    query = {}
    if vendor_id:
        query["vendorId"] = vendor_id
    docs = list(_db.COLS["inventory_movement"].find(query).sort("occurredAt", -1).limit(limit))
    return jsonify([jsonify_doc(d) for d in docs])
