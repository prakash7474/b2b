"""
Vendor Registry & Product Catalog routes for B2P Backend.
Extracted from app.py — handles CRUD operations for partner vendors and product catalog.
"""

import traceback
from datetime import datetime
from flask import request, jsonify
from pymongo import DESCENDING
from backend.config import app
import backend.database as _db
from backend.database import (
    log_event, write_movement, sync_vendor_inventory_with_batches,
    jsonify_doc, parse_date,
)


# ==============================================================================
# ROUTE: GET /api/vendors
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns the list of partner grocery/tiffin vendors with dynamic fleet statistics.
#   Supports query parameters:
#     - `status`: "active", "pending" (requisitions), or "all".
#     - `sort`: "demand" (highest predicted consumption), "batches", or "name".
#
# PERFORMANCE OPTIMIZATION:
#   Runs a single MongoDB `$group` aggregation pipeline on `COLS["batches"]` to
#   count total batches and received batches for all vendors in ONE query.
#   Avoids executing N queries inside the loop (preventing N+1 query bottlenecks).
#
# INSTRUCTOR VIVA POINT:
#   Q: "How is default demand estimated for vendors in this listing?"
#   A: "Using the formula: 15.0 kg + (hotspotDensityScore * 0.3). This gives an
#      instant demand approximation based on high-density footfall locations."
# ==============================================================================
@app.route("/api/vendors", methods=["GET"])
def get_vendors():
    status_filter = request.args.get("status")
    sort_by = request.args.get("sort", "demand")

    query = {}
    if status_filter == "pending":
        query["verificationStatus"] = "pending"
    elif status_filter == "active":
        query["verificationStatus"] = {"$nin": ["rejected", "terminated", "pending"]}
    elif status_filter != "all":
        # Default active vendors for main vendors screen
        query["verificationStatus"] = {"$nin": ["rejected", "terminated", "pending"]}

    docs = list(_db.COLS["vendors"].find(query))

    # Single-pass batch count aggregation across all vendors
    counts = {}
    for c in _db.COLS["batches"].aggregate([
        {"$group": {
            "_id": "$vendor_id",
            "batch_count": {"$sum": 1},
            "received_count": {"$sum": {"$cond": [{"$eq": ["$status", "received"]}, 1, 0]}},
        }}
    ]):
        counts[c["_id"]] = c

    result = []
    for d in docs:
        item = jsonify_doc(d)
        c = counts.get(d.get("vendor_id"), {})
        item["batch_count"] = c.get("batch_count", 0)
        item["received_count"] = c.get("received_count", 0)
        # Add a baseline predicted demand estimate if not yet cached
        item["predicted_demand_kg"] = round(15.0 + (item.get("hotspotDensityScore", 30) * 0.3), 1)
        result.append(item)

    # Sort results according to user selection
    if sort_by == "name":
        result.sort(key=lambda x: x.get("shop_name", "").lower())
    elif sort_by == "batches":
        result.sort(key=lambda x: x.get("batch_count", 0), reverse=True)
    else:  # demand descending by default per spec
        result.sort(key=lambda x: x.get("predicted_demand_kg", 0), reverse=True)

    return jsonify(result)


# ==============================================================================
# ROUTE: GET /api/vendors/<vendor_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Fetches detailed profile for a single merchant (refrigeration specs, FSSAI cert,
#   locality tier, rating) along with all batches assigned to this vendor.
# ==============================================================================
@app.route("/api/vendors/<vendor_id>", methods=["GET"])
def get_vendor(vendor_id):
    doc = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not doc:
        return jsonify({"error": "Vendor not found"}), 404
    item = jsonify_doc(doc)
    batches_list = list(_db.COLS["batches"].find({"vendor_id": vendor_id}).sort("created_at", DESCENDING))
    item["batches"] = [jsonify_doc(b) for b in batches_list]
    return jsonify(item)


# ==============================================================================
# ROUTE: PATCH / PUT /api/vendors/<vendor_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Updates vendor operational parameters and manages onboarding state transitions.
#
# AUDIT LOGGING:
#   When `verificationStatus` changes, automatically generates an audit log entry:
#     - "active": Admin approved vendor requisition.
#     - "rejected": Admin rejected vendor requisition.
#     - "terminated": Admin severed relationship due to compliance/payment issues.
# ==============================================================================
@app.route("/api/vendors/<vendor_id>", methods=["PATCH", "PUT"])
def update_vendor(vendor_id):
    try:
        data = request.json or {}
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        shop_name = vendor.get("shop_name", vendor_id)

        update_fields = {}
        for k in ["shop_name", "owner_name", "phone", "address", "localityTier",
                  "hotspotDensityScore", "hasRefrigerator", "storageType",
                  "fridgeTemperatureC", "rating", "verificationStatus"]:
            if k in data:
                update_fields[k] = data[k]

        if "verificationStatus" in data:
            status = data["verificationStatus"]
            if status == "active":
                log_event("activity", "info", "Admin",
                          f"Admin approved vendor requisition — {shop_name}",
                          {"type": "vendor", "id": vendor_id, "name": shop_name})
            elif status == "rejected":
                log_event("activity", "warning", "Admin",
                          f"Admin rejected vendor requisition — {shop_name}",
                          {"type": "vendor", "id": vendor_id, "name": shop_name})
            elif status == "terminated":
                log_event("activity", "critical", "Admin",
                          f"Admin terminated business relationship with {shop_name}",
                          {"type": "vendor", "id": vendor_id, "name": shop_name})

        _db.COLS["vendors"].update_one({"vendor_id": vendor_id}, {"$set": update_fields})
        updated = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        return jsonify(jsonify_doc(updated))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: POST /api/vendors
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Enrolls a new retail partner store into the network.
#   Validates vendor_id uniqueness, captures cold storage parameters,
#   and writes an audit log entry.
# ==============================================================================
@app.route("/api/vendors", methods=["POST"])
def create_vendor():
    try:
        data = request.json
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400
        if _db.COLS["vendors"].find_one({"vendor_id": vendor_id}):
            return jsonify({"error": f"Vendor {vendor_id} already exists"}), 409
        doc = {
            "vendor_id": vendor_id,
            "shop_name": data.get("shop_name", ""),
            "owner_name": data.get("owner_name", ""),
            "phone": data.get("phone", ""),
            "address": data.get("address", ""),
            "localityTier": data.get("localityTier", "residential_budget"),
            "hotspotDensityScore": float(data.get("hotspotDensityScore", 30)),
            "hasRefrigerator": data.get("hasRefrigerator", "0") == "1",
            "storageType": data.get("storageType", "counter"),
            "fridgeTemperatureC": float(data.get("fridgeTemperatureC", 5)),
            "rating": float(data.get("rating", 4.0)),
            "verificationStatus": data.get("verificationStatus", "active"),
            "createdAt": datetime.utcnow(),
        }
        _db.COLS["vendors"].insert_one(doc)
        log_event("activity", "info", "Admin", f"Admin registered vendor {doc['shop_name']}", {"type": "vendor", "id": vendor_id, "name": doc['shop_name']})
        return jsonify({"ok": True, "vendor_id": vendor_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ==============================================================================
# ROUTE: DELETE /api/vendors/<vendor_id>
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Executes a cascading delete: removes the vendor record from `vendors` and
#   deletes associated batches from `batches`.
#   Logs a critical audit event.
# ==============================================================================
@app.route("/api/vendors/<vendor_id>", methods=["DELETE"])
def delete_vendor(vendor_id):
    try:
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
        name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
        _db.COLS["vendors"].delete_one({"vendor_id": vendor_id})
        _db.COLS["batches"].delete_many({"vendor_id": vendor_id})
        log_event("activity", "critical", "Admin", f"Admin deleted vendor record {name}", {"type": "vendor", "id": vendor_id, "name": name})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# PRODUCT CATALOG SPECIFICATIONS
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: GET /api/products
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns the master catalog of batter varieties (Idli Batter, Dosa Batter,
#   Ragi/Millet Batter) with shelf-life tolerances, packaging sizes, and unit prices.
# ==============================================================================
@app.route("/api/products", methods=["GET"])
def get_products():
    docs = list(_db.COLS["products"].find({}))
    return jsonify([jsonify_doc(d) for d in docs])


# ════════════════════════════════════════════════════════════════════
# VENDOR HISTORICAL BATCH AUDIT LOG
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: GET /api/vendors/<vendor_id>/batch-history
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns archived and stocked-out batches for historical store ledger audits.
#
# INSTRUCTOR VIVA POINT:
#   Q: "Do archived batches affect the live Random Forest spoilage model?"
#   A: "No! Archived batches have already been consumed or depleted. Including
#      them would generate false spoilage alerts for batter that is no longer on shelves."
# ==============================================================================
@app.route("/api/vendors/<vendor_id>/batch-history", methods=["GET"])
def get_vendor_batch_history(vendor_id):
    """Returns archived and stocked-out batches for vendor log history view.

    These batches do NOT affect the spoilage risk model.
    """
    limit = int(request.args.get("limit", 50))
    docs = list(_db.COLS["batches"].find(
        {"vendor_id": vendor_id, "status": {"$in": ["archived", "stockout"]}},
    ).sort("created_at", DESCENDING).limit(limit))

    result = []
    for d in docs:
        item = jsonify_doc(d)
        item["is_historical"] = True  # flag for frontend rendering
        result.append(item)

    return jsonify(result)
