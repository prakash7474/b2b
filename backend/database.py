import os
from datetime import datetime, timedelta
from bson import ObjectId
from pymongo import MongoClient, DESCENDING

from backend.services.constants import PRODUCT_NAME_TO_ID

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client["b2p"]

# ── Database Collections (Tables) ────────────────────────────────────
COLS = {
    # Operational (OLTP Collections)
    "vendors":            db["vendors"],            # Partner shop profiles (owner, location, tier)
    "products":           db["products"],           # Products catalog (Idli Batter, Dosa Batter, etc.)
    "batches":            db["batches"],            # Manufactured batches with pH, volume, status
    "inventory":          db["inventory"],          # Current shop inventory records
    "orders":             db["orders"],             # Completed store orders & sales
    "order_items":        db["order_items"],        # Individual line items in orders
    "logs":               db["logs"],               # Activity & alert logs (audit trail)

    # Vendor Restock Workflow
    "restock_requests":   db["restock_requests"],   # Pending restock requests from shops

    # Analytical (ML Feature Store & Logs)
    "predictions":        db["predictions"],        # Log of past ML prediction inferences
    "inventory_movement": db["inventory_movement"], # Ledger of every stock in/out movement
    "weather_forecast":   db["weather_forecast"],   # Temperature & rain probability
    "festival_calendar":  db["festival_calendar"],  # Holiday calendar for demand spikes
    "feature_snapshots":  db["feature_snapshots"],  # Cached pre-computed ML feature rows
}

# ══════════════════════════════════════════════════════════════════════════════
# 📌 FUNCTION: log_event(event_type, severity, actor, event, related_to, metadata)
# ══════════════════════════════════════════════════════════════════════════════
# 💡 WHAT THIS FUNCTION DOES (EXPLAIN TO INSTRUCTOR):
#    This is the centralized audit logging engine for the B2P platform.
#    Whenever ANY important event happens in the supply chain (e.g. batch created,
#    stock received, restock approved, spoilage detected, incident reported),
#    this function records a permanent timestamped document into MongoDB collection `logs`.
#
# ⚙️ HOW IT WORKS & WHAT IT INTERACTS WITH:
#    - Writes directly to: `COLS["logs"]` (MongoDB collection)
#    - Read by: `GET /api/logs` (LogsScreen in the Admin Console)
#    - Parameters:
#        * event_type: "activity" (normal actions), "alert" (warnings), "system" (lifecycle)
#        * severity: "info", "warning", "critical"
#        * actor: Who did it? ("Admin", "System", or vendor ID/name)
#        * event: Human-readable explanation sentence.
#        * related_to: Dictionary linking to affected vendor, batch, or order.
# ══════════════════════════════════════════════════════════════════════════════
def log_event(event_type, severity, actor, event, related_to=None, metadata=None):
    try:
        COLS["logs"].insert_one({
            "timestamp": datetime.utcnow(),
            "type": event_type,        # "activity" | "alert" | "system"
            "severity": severity,      # "info" | "warning" | "critical"
            "actor": actor,            # "Admin", "System", or vendor name
            "event": event,            # plain-language sentence
            "related_to": related_to,  # {"type": "vendor"|"batch"|"inventory", "id": "...", "name": "..."}
            "metadata": metadata or {},
        })
    except Exception as e:
        print("Error logging event:", e)


# ══════════════════════════════════════════════════════════════════════════════
# 📌 FUNCTION: ensure_indexes()
# ══════════════════════════════════════════════════════════════════════════════
# 💡 WHAT THIS FUNCTION DOES (EXPLAIN TO INSTRUCTOR):
#    Creates B-Tree database indexes across MongoDB collections during server startup.
#    Without indexes, MongoDB performs full collection table scans (O(N) time complexity).
#    With these indexes, queries execute in O(log N) time, ensuring instantaneous response times
#    even when managing thousands of batches and orders!
#
# 🔍 KEY INDEX TYPES USED:
#    1. Compound Indexes: E.g., `("vendor_id", 1), ("status", 1), ("created_at", -1)` on batches.
#       Allows multi-field filtering (e.g. "Find all active batches for vendor V100 sorted by latest").
#    2. 2dsphere Index: `("location", "2dsphere")` on vendors.
#       Allows geospatial queries like `$near` to find closest delivery hubs on a map!
#    3. Unique Index: `("date", 1)` on festival_calendar.
#       Prevents accidental duplicate entries for the same calendar date.
# ══════════════════════════════════════════════════════════════════════════════
def ensure_indexes():
    try:
        client.admin.command("ping")
    except Exception:
        return
    spec = {
        "vendors": [
            [("vendor_id", 1)],
            [("verificationStatus", 1)],
        ],
        "batches": [
            [("batch_id", 1)],
            [("vendor_id", 1), ("status", 1), ("created_at", -1)],
        ],
        "inventory": [
            [("inventory_id", 1)],
            [("vendor_id", 1)],
            [("batch_number", 1)],
            [("freshnessScore", 1)],   # renamed from freshness_score
        ],
        "orders": [
            [("order_id", 1)],
            [("vendor_id", 1), ("order_date", -1)],
        ],
        "order_items": [
            [("order_id", 1)],
            [("inventory_id", 1)],
        ],
        "predictions": [
            [("predictionType", 1)],
            [("generatedAt", -1)],
            [("vendorId", 1)],
            [("batchId", 1)],
        ],
        "inventory_movement": [
            [("vendorId", 1), ("occurredAt", -1)],
            [("batchId", 1)],
            [("movementType", 1)],
        ],
        "weather_forecast": [
            [("forecastFor", 1)],
            [("forecastIssuedAt", -1)],
        ],
        "feature_snapshots": [
            [("vendorId", 1)],
            [("predictionId", 1)],
            [("createdAt", -1)],
        ],

        "restock_requests": [
            [("vendor_id", 1), ("status", 1)],
            [("status", 1), ("created_at", -1)],
            [("request_id", 1)],
        ],

    }
    for coll, indexes in spec.items():
        for keys in indexes:
            try:
                COLS[coll].create_index(keys)
            except Exception as e:
                print(f"  [WARN] Could not index {coll} {keys}: {e}")

    # 2dsphere index for vendor GeoJSON location (enables $near queries)
    try:
        COLS["vendors"].create_index([("location", "2dsphere")])
    except Exception as e:
        print(f"  [WARN] Could not create 2dsphere index on vendors.location: {e}")

    # festival_calendar: unique index on date
    try:
        COLS["festival_calendar"].create_index([("date", 1)], unique=True, sparse=True)
    except Exception as e:
        print(f"  [WARN] Could not create unique index on festival_calendar.date: {e}")


try:
    ensure_indexes()
except Exception:
    pass


def write_movement(vendor_id, product_id, movement_type, quantity, batch_id=None,
                   related_order_id=None, expiry_at=None, triggered_by="system",
                   previous_qty=None, new_qty=None, notes=""):
    """Append an event to inventory_movement for every stock change.

    movement_type: "receive" | "sale" | "add" | "remove" | "edit" | "adjustment" | "stockout"
    quantity: positive = stock in, negative = stock out
    """
    try:
        now = datetime.utcnow()
        doc = {
            "movementId": f"IM_{int(now.timestamp()*1000)}_{vendor_id}",
            "vendorId": vendor_id,
            "productId": product_id,
            "batchId": batch_id,
            "movementType": movement_type,
            "quantity": quantity,          # positive = in, negative = out
            "occurredAt": now,
            "relatedOrderId": related_order_id,
            "expiryAt": expiry_at,
            "triggeredBy": triggered_by,
            "metadata": {
                "notes": notes,
                "previousQty": previous_qty,
                "newQty": new_qty,
            },
        }
        COLS["inventory_movement"].insert_one(doc)
    except Exception as e:
        print(f"[WARN] write_movement failed: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 📌 FUNCTION: sync_vendor_inventory_with_batches(vendor_id, new_batch=None)
# ══════════════════════════════════════════════════════════════════════════════
# 💡 WHAT THIS FUNCTION DOES (CRITICAL ARCHITECTURAL CORE! STUDY THIS!):
#    Guarantees ZERO-DISCREPANCY between individual physical batches in `batches`
#    and the aggregate stock balance in `inventory`.
#
# ⚙️ STEP-BY-STEP RECONCILIATION LOGIC:
#    1. Query MongoDB for all batches assigned to `vendor_id` whose status is
#       ACTIVE: `status in ["received", "assigned"]`.
#       (Archived or stocked-out batches are strictly excluded!).
#    2. Calculates `total_active_stock = sum(batch.volume_kg)`.
#    3. If `total_active_stock == 0`, updates inventory to 0 kg and sets freshnessScore=0.
#    4. If active batches exist:
#       - Finds primary batch (the earliest received batch).
#       - Updates the vendor's inventory document with the true active sum,
#         batch number, product name, and last_updated timestamp.
#       - Deduplicates: if duplicate inventory documents exist for this vendor,
#         it safely purges the extras so each vendor has exactly ONE clean record.
#    5. Returns: `(total_active_stock_kg, active_batches)`.
# ══════════════════════════════════════════════════════════════════════════════
def sync_vendor_inventory_with_batches(vendor_id: str, new_batch: dict = None):
    """
    Ensure the vendor's inventory document(s) strictly match the sum of their active batches.
    Active batches are those with status in ['received', 'assigned'].
    Returns:
        (total_active_stock_kg, active_batches)
    """
    if not vendor_id:
        return 0.0, []

    now = datetime.utcnow()
    active_batches = list(COLS["batches"].find({
        "vendor_id": vendor_id,
        "status": {"$in": ["received", "assigned"]}
    }))
    if new_batch and isinstance(new_batch, dict):
        if not any(isinstance(b, dict) and b.get("batch_id") == new_batch.get("batch_id") for b in active_batches):
            active_batches.append(new_batch)

    total_active_stock = round(sum(
        float(b.get("volume_kg", b.get("quantity_kg", 0.0)))
        for b in active_batches
        if isinstance(b, dict)
    ), 1)

    inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    if not inv_items:
        existing_single = COLS["inventory"].find_one({"vendor_id": vendor_id})
        if existing_single:
            inv_items = [existing_single]

    if total_active_stock == 0:
        COLS["inventory"].update_many(
            {"vendor_id": vendor_id},
            {"$set": {"quantity": 0.0, "last_updated": now, "freshnessScore": 0.0}}
        )
        return 0.0, []

    received_batches = [b for b in active_batches if isinstance(b, dict) and b.get("status") == "received"]
    primary_batch = (received_batches[0] if received_batches else (active_batches[0] if active_batches else None))

    batch_num = primary_batch.get("batch_number", primary_batch.get("batch_id", "N/A")) if primary_batch else "NONE"
    product_name = primary_batch.get("product_name", "Idli Batter") if primary_batch else (inv_items[0].get("product_name") if inv_items else "Idli Batter")
    product_id = PRODUCT_NAME_TO_ID.get(product_name, "Idly_Batter")

    if not inv_items:
        new_inv = {
            "inventory_id": f"INV_{vendor_id}",
            "vendor_id": vendor_id,
            "product_id": product_id,
            "product_name": product_name,
            "batch_number": batch_num,
            "quantity": total_active_stock,
            "minimumStock": 10.0,
            "freshnessScore": 0.95 if total_active_stock > 0 else 0.0,
            "receivedAt": now,
            "last_updated": now,
        }
        COLS["inventory"].insert_one(new_inv)
    else:
        primary_doc = inv_items[0]
        primary_id = primary_doc.get("_id")
        inv_filter = {"_id": primary_id} if primary_id is not None else {"vendor_id": vendor_id}
        update_fields = {
            "quantity": total_active_stock,
            "last_updated": now,
        }
        if primary_batch:
            update_fields["batch_number"] = batch_num
            update_fields["product_name"] = product_name
            if "received_at" in primary_batch or "receivedAt" in primary_batch:
                update_fields["receivedAt"] = primary_batch.get("received_at") or primary_batch.get("receivedAt")

        COLS["inventory"].update_one(
            inv_filter,
            {"$set": update_fields}
        )
        if len(inv_items) > 1:
            other_ids = [i.get("_id") for i in inv_items[1:] if i.get("_id") is not None]
            if other_ids:
                COLS["inventory"].delete_many({"_id": {"$in": other_ids}})

    return total_active_stock, active_batches


def jsonify_doc(doc):
    if not doc:
        return doc
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.strftime("%Y-%m-%dT%H:%M:%SZ")
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


# ==============================================================================
# FUNCTION: parse_date(val)
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Robust multi-format date parser. Converts diverse incoming date representations
#   (ISO-8601 strings, millisecond timestamps, date-only strings) into Python `datetime`.
#
# SUPPORTED FORMATS:
#   - Standard UTC ISO: "%Y-%m-%dT%H:%M:%SZ"
#   - Fractional Seconds: "%Y-%m-%dT%H:%M:%S.%fZ"
#   - Local DateTime: "%Y-%m-%dT%H:%M:%S" or "%Y-%m-%dT%H:%M"
#   - Date Only: "%Y-%m-%d"
#   - Fallback: returns current UTC timestamp (`datetime.utcnow()`) if parsing fails.
# ==============================================================================
def parse_date(val):
    if isinstance(val, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M",
        ):
            try:
                return datetime.strptime(val, fmt)
            except Exception:
                pass
    if isinstance(val, datetime):
        return val
    return datetime.utcnow()
