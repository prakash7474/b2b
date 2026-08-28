"""
B2P (Batter-to-Plate) — Unified Platform
Admin creates batches → assigns to vendors → vendors confirm receipt → ML predictions.
"""

import os
import math
import traceback
from datetime import datetime, timedelta
from functools import wraps
from bson import ObjectId
from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
from flask_cors import CORS
from pymongo import MongoClient, DESCENDING
import joblib
import pandas as pd
import numpy as np

# ── Secret loading (from env / gitignored atlas-credentials.env) ─────
def _load_env_file(path="atlas-credentials.env"):
    """Load a simple KEY=VALUE file into the environment without extra deps."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), val)


_load_env_file()

# ── Flask setup ──────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "b2p-secret-key-rotate-in-production")

# Restrict CORS to explicit origins (scoped) instead of allowing all origins.
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "http://localhost:5000,http://127.0.0.1:5000"
).split(",") if o.strip()]
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

# ── Admin credentials (read from environment) ───────────────────────
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

# ── MongoDB connection ──────────────────────────────────────────────
MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client["b2p"]

# ── Collections ─────────────────────────────────────────────────────
COLS = {
    "vendors": db["vendors"],
    "products": db["products"],
    "batches": db["batches"],
    "inventory": db["inventory"],
    "orders": db["orders"],
    "order_items": db["order_items"],
    "predictions": db["predictions"],
}

# ── Database indexes (created at startup to speed up common queries) ─
def ensure_indexes():
    spec = {
        "vendors": [[("vendor_id", 1)]],
        "batches": [
            [("batch_id", 1)],
            [("vendor_id", 1), ("status", 1), ("created_at", -1)],
        ],
        "inventory": [
            [("inventory_id", 1)],
            [("vendor_id", 1)],
            [("batch_number", 1)],
            [("freshness_score", 1)],
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
    }
    for coll, indexes in spec.items():
        for keys in indexes:
            try:
                COLS[coll].create_index(keys)
            except Exception as e:
                print(f"  [WARN] Could not index {coll} {keys}: {e}")


ensure_indexes()

# ── Load ML models ─────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

print("Loading demand forecast model...")
demand_bundle = joblib.load(os.path.join(BASE_DIR, "demand_forecast_model.pkl"))
demand_model = demand_bundle["model"]
demand_features = demand_bundle["features"]
locality_encoder = demand_bundle["locality_encoder"]
festival_encoder = demand_bundle["festival_encoder"]
product_encoder = demand_bundle["product_encoder"]
print(f"  [OK] Demand model loaded")

print("Loading spoilage risk model...")
spoilage_bundle = joblib.load(os.path.join(BASE_DIR, "spoilage_risk_model.pkl"))
spoilage_model = spoilage_bundle["model"]
spoilage_features = spoilage_bundle["features"]
storage_encoder = spoilage_bundle["storage_encoder"]
label_encoder = spoilage_bundle["label_encoder"]
print(f"  [OK] Spoilage model loaded")

KNOWN_LOCALITIES = list(locality_encoder.classes_)
KNOWN_FESTIVALS = list(festival_encoder.classes_)
KNOWN_PRODUCTS = list(product_encoder.classes_)
KNOWN_STORAGE = list(storage_encoder.classes_)

# Maps human-friendly product names (frontend labels) to the encoded IDs
# the demand model was trained on (productId column in the CSV).
PRODUCT_NAME_TO_ID = {
    "Idli Batter": "Idly_Batter",
    "Dosa Batter": "Dosa_Batter",
    "Combo Pack": "Combo_Pack",
    "Rava Batter": "Dosa_Batter",
}


# ════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════
def safe_encode(encoder, value, known_labels):
    if value in known_labels:
        return int(encoder.transform([value])[0])
    return 0


def jsonify_doc(doc):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


def parse_date(val):
    if isinstance(val, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%Y-%m-%dT%H:%M"):
            try:
                return datetime.strptime(val, fmt)
            except Exception:
                pass
    if isinstance(val, datetime):
        return val
    return datetime.utcnow()


def compute_sales_features(vendor_id, product_name, target_date, window):
    """Compute ML demand features from actual order history in the database.
    
    Returns a dict with all 17 features for the XGBoost demand model.
    Based on B2P_ML_Parameter_Lists_2Pages.html Layer 1 specs.
    """
    now = datetime.utcnow()
    hour = 7 if window == "morning" else 17
    
    # ── Time features (from ORDERS.order_date) ──
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    weekday = target_date.weekday()
    weekday_sin = math.sin(2 * math.pi * weekday / 7)
    weekday_cos = math.cos(2 * math.pi * weekday / 7)
    is_weekend = 1 if weekday >= 5 else 0
    
    # ── Get vendor data ──
    vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
    locality = vendor.get("localityTier", "residential_budget") if vendor else "residential_budget"
    hotspot = vendor.get("hotspotDensityScore", 30) if vendor else 30
    vendor_rating = vendor.get("rating", 4.0) if vendor else 4.0
    
    # ── Get product ID for encoding ──
    product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)
    
    # ── Sales History: query ORDER_ITEMS + ORDERS for this vendor ──
    vendor_orders = list(COLS["orders"].find(
        {"vendor_id": vendor_id},
        {"order_id": 1, "order_date": 1}
    ).sort("order_date", -1).limit(100))

    # Get order items to compute actual units sold for the TARGET product.
    # order_items links to inventory via inventory_id; inventory carries
    # product_name, so we resolve each line item to a product and only count
    # units that belong to the requested product (not all products).
    order_ids = [o["order_id"] for o in vendor_orders]
    inv_by_id = {
        i["inventory_id"]: i.get("product_name")
        for i in COLS["inventory"].find({"vendor_id": vendor_id})
        if i.get("inventory_id")
    }
    vendor_items = list(COLS["order_items"].find(
        {"order_id": {"$in": order_ids}} if order_ids else {},
        {"order_id": 1, "inventory_id": 1, "quantity": 1}
    ))

    # Map order_id → total units sold (scoped to the target product)
    order_units = {}
    for item in vendor_items:
        if inv_by_id.get(item.get("inventory_id")) != product_name:
            continue
        oid = item["order_id"]
        order_units[oid] = order_units.get(oid, 0) + item.get("quantity", 0)
    
    # ── Compute sales velocity features ──
    lag1 = 0
    lag7 = 0
    rolling_7d_sales = []
    rolling_28d_sales = []
    same_slot_4wk_sales = []
    
    for order in vendor_orders:
        odate = order.get("order_date")
        if isinstance(odate, str):
            odate = parse_date(odate)
        if not odate:
            continue
        units = order_units.get(order["order_id"], 0)
        days_ago = (now - odate).days
        
        if days_ago <= 1:
            lag1 += units
        if days_ago <= 7:
            lag7 += units
            rolling_7d_sales.append(units)
        if days_ago <= 28:
            rolling_28d_sales.append(units)
            if odate.weekday() == weekday:
                same_slot_4wk_sales.append(units)
    
    rolling7_mean = sum(rolling_7d_sales) / max(1, len(rolling_7d_sales)) if rolling_7d_sales else 15.0
    rolling7_std = float(np.std(rolling_7d_sales)) if len(rolling_7d_sales) > 1 else 4.0
    rolling28_mean = sum(rolling_28d_sales) / max(1, len(rolling_28d_sales)) if rolling_28d_sales else 15.0
    same_slot_4wk = sum(same_slot_4wk_sales) / max(1, len(same_slot_4wk_sales)) if same_slot_4wk_sales else rolling7_mean
    
    if not vendor_orders:
        lag1 = 15.0
        lag7 = 14.0
        rolling7_mean = 15.0
        rolling7_std = 4.0
        rolling28_mean = 15.0
        same_slot_4wk = 16.0
    
    recent_trend = rolling7_mean / rolling28_mean if rolling28_mean > 0 else 1.0
    
    # ── Current stock level (from INVENTORY) ──
    inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    available_stock = sum(i.get("quantity", 0) for i in inv_items)
    
    # ── Weather: defaults (OpenWeatherMap in production) ──
    temperature = 31.0
    rain_prob = 0.2
    
    feature_dict = {
        "hourSin": round(hour_sin, 4),
        "hourCos": round(hour_cos, 4),
        "weekdaySin": round(weekday_sin, 4),
        "weekdayCos": round(weekday_cos, 4),
        "isWeekend": is_weekend,
        "isFestivalWindow": 0,
        "forecastTemperatureC": temperature,
        "forecastRainProbability": rain_prob,
        "lag1": round(lag1, 1),
        "lag7": round(lag7, 1),
        "rolling7DayMean": round(rolling7_mean, 1),
        "rolling7DayStd": round(rolling7_std, 1),
        "sameSlot4WeekMean": round(same_slot_4wk, 1),
        "recentTrend": round(recent_trend, 4),
        "localityTierEnc": safe_encode(locality_encoder, locality, KNOWN_LOCALITIES),
        "hotspotDensityScore": hotspot,
        "productIdEnc": safe_encode(product_encoder, product_id, KNOWN_PRODUCTS),
    }
    
    return feature_dict, available_stock, vendor_rating


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


# /api/login (creates the session) and /api/me (login-state probe) stay public.
PUBLIC_API_ENDPOINTS = {"/api/login", "/api/me", "/api/logout"}


@app.before_request
def _require_api_auth():
    """Enforce login on every /api/* endpoint except the allowlist."""
    if not request.path.startswith("/api/"):
        return
    if request.method == "OPTIONS":  # CORS preflight
        return
    if request.path in PUBLIC_API_ENDPOINTS:
        return
    if "user" not in session:
        return jsonify({"error": "Authentication required"}), 401


# ════════════════════════════════════════════════════════════════════
# LOGIN / LOGOUT
# ════════════════════════════════════════════════════════════════════
@app.route("/login", methods=["GET"])
def login_page():
    return send_from_directory("static", "login.html")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    role = data.get("role", "admin")

    if role == "admin":
        username = data.get("username", "")
        password = data.get("password", "")
        if username == ADMIN_USER and password == ADMIN_PASS:
            session["user"] = {"role": "admin", "username": username}
            return jsonify({"ok": True, "role": "admin"})
        return jsonify({"error": "Invalid credentials"}), 401

    elif role == "vendor":
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        session["user"] = {"role": "vendor", "vendor_id": vendor_id, "shop_name": vendor.get("shop_name", "")}
        return jsonify({"ok": True, "role": "vendor", "shop_name": vendor.get("shop_name", "")})

    return jsonify({"error": "Invalid role"}), 400


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    if "user" not in session:
        return jsonify({"loggedIn": False})
    return jsonify({"loggedIn": True, **session["user"]})


# ════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════
@app.route("/api/dashboard")
def dashboard():
    vendors = COLS["vendors"]
    batches = COLS["batches"]
    inventory = COLS["inventory"]
    orders = COLS["orders"]
    predictions = COLS["predictions"]

    total_vendors = vendors.count_documents({})
    total_batches = batches.count_documents({})
    assigned_batches = batches.count_documents({"status": "assigned"})
    received_batches = batches.count_documents({"status": "received"})
    total_inventory = inventory.count_documents({})
    # Aggregate total stock on the server instead of pulling every doc.
    stock_agg = list(inventory.aggregate(
        [{"$group": {"_id": None, "qty": {"$sum": "$quantity"}}}]
    ))
    total_stock = stock_agg[0]["qty"] if stock_agg else 0
    low_stock = inventory.count_documents({"$expr": {"$lte": ["$quantity", "$minimum_stock"]}})
    high_freshness_risk = inventory.count_documents({"freshness_score": {"$gt": 0.7}})
    total_orders = orders.count_documents({})
    pending_orders = orders.count_documents({"order_status": {"$in": ["pending", "confirmed", "preparing"]}})
    total_predictions = predictions.count_documents({})

    return jsonify({
        "totalVendors": total_vendors,
        "totalBatches": total_batches,
        "assignedBatches": assigned_batches,
        "receivedBatches": received_batches,
        "totalInventoryItems": total_inventory,
        "totalStockQuantity": total_stock,
        "lowStockItems": low_stock,
        "highFreshnessRisk": high_freshness_risk,
        "totalOrders": total_orders,
        "pendingOrders": pending_orders,
        "totalPredictions": total_predictions,
    })


# ════════════════════════════════════════════════════════════════════
# VENDORS
# ════════════════════════════════════════════════════════════════════
@app.route("/api/vendors", methods=["GET"])
def get_vendors():
    docs = list(COLS["vendors"].find({}))
    # Aggregate batch counts for every vendor in a single pass (avoids N+1).
    counts = {}
    for c in COLS["batches"].aggregate([
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
        result.append(item)
    return jsonify(result)


@app.route("/api/vendors/<vendor_id>", methods=["GET"])
def get_vendor(vendor_id):
    doc = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not doc:
        return jsonify({"error": "Vendor not found"}), 404
    item = jsonify_doc(doc)
    # Get assigned batches
    batches_list = list(COLS["batches"].find({"vendor_id": vendor_id}).sort("created_at", DESCENDING))
    item["batches"] = [jsonify_doc(b) for b in batches_list]
    return jsonify(item)


@app.route("/api/vendors", methods=["POST"])
def create_vendor():
    try:
        data = request.json
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400
        if COLS["vendors"].find_one({"vendor_id": vendor_id}):
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
            "createdAt": datetime.utcnow(),
        }
        COLS["vendors"].insert_one(doc)
        return jsonify({"ok": True, "vendor_id": vendor_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/vendors/<vendor_id>", methods=["DELETE"])
def delete_vendor(vendor_id):
    try:
        COLS["vendors"].delete_one({"vendor_id": vendor_id})
        COLS["batches"].delete_many({"vendor_id": vendor_id})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# PRODUCTS
# ════════════════════════════════════════════════════════════════════
@app.route("/api/products", methods=["GET"])
def get_products():
    docs = list(COLS["products"].find({}))
    return jsonify([jsonify_doc(d) for d in docs])


# ════════════════════════════════════════════════════════════════════
# BATCHES (Core: create → assign → receive)
# ════════════════════════════════════════════════════════════════════
@app.route("/api/batches", methods=["GET"])
def get_batches():
    query = {}
    vendor_id = request.args.get("vendor_id")
    status = request.args.get("status")
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    docs = list(COLS["batches"].find(query).sort("created_at", DESCENDING))
    # Resolve vendor shop names in one query (avoids N+1).
    vendor_ids = {d.get("vendor_id") for d in docs if d.get("vendor_id")}
    vendor_names = {}
    if vendor_ids:
        for v in COLS["vendors"].find(
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


@app.route("/api/batches", methods=["POST"])
def create_batch():
    """Admin creates a new batch with batter parameters."""
    try:
        data = request.json
        batch_id = data.get("batch_id", "").strip()
        if not batch_id:
            return jsonify({"error": "batch_id is required"}), 400
        if COLS["batches"].find_one({"batch_id": batch_id}):
            return jsonify({"error": f"Batch {batch_id} already exists"}), 409

        doc = {
            "batch_id": batch_id,
            "product_name": data.get("product_name", "Idli Batter"),
            "manufacturer": data.get("manufacturer", "B2P Central Kitchen"),
            "batch_number": data.get("batch_number", batch_id),
            "mfg_timestamp": parse_date(data.get("mfg_timestamp", datetime.utcnow().isoformat())),
            "volume_kg": float(data.get("volume_kg", 1.0)),
            "initialPH": float(data.get("initialPH", 4.4)),
            "temperatureC": float(data.get("temperatureC", 25.0)),
            "humidityPct": float(data.get("humidityPct", 50.0)),
            "fermentationHours": float(data.get("fermentationHours", 8.0)),
            "notes": data.get("notes", ""),
            # Assignment fields
            "vendor_id": "",
            "status": "created",  # created → assigned → received
            "assigned_at": None,
            "received_at": None,
            "received_notes": "",
            "created_at": datetime.utcnow(),
        }
        COLS["batches"].insert_one(doc)
        return jsonify({"ok": True, "batch_id": batch_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>", methods=["PUT"])
def update_batch(batch_id):
    """Admin updates batch (e.g., assign to vendor)."""
    try:
        data = request.json
        update_fields = {}

        if "vendor_id" in data:
            update_fields["vendor_id"] = data["vendor_id"]
            update_fields["status"] = "assigned"
            update_fields["assigned_at"] = datetime.utcnow()

        if "status" in data:
            update_fields["status"] = data["status"]

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        result = COLS["batches"].update_one({"batch_id": batch_id}, {"$set": update_fields})
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/assign", methods=["PUT"])
def assign_batch(batch_id):
    """Admin assigns a batch to a vendor."""
    try:
        data = request.json
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        result = COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {"vendor_id": vendor_id, "status": "assigned", "assigned_at": datetime.utcnow()}}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404
        return jsonify({"ok": True, "vendor_id": vendor_id, "vendor_name": vendor.get("shop_name", "")})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/receive", methods=["PUT"])
def receive_batch(batch_id):
    """Vendor confirms receipt of a batch."""
    try:
        data = request.json or {}
        notes = data.get("notes", "")

        result = COLS["batches"].update_one(
            {"batch_id": batch_id, "status": "assigned"},
            {"$set": {"status": "received", "received_at": datetime.utcnow(), "received_notes": notes}}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found or not in assigned status"}), 404

        # Also create inventory entry
        batch = COLS["batches"].find_one({"batch_id": batch_id})
        if batch:
            inv_id = f"INV{batch_id.replace('B', '')}"
            if not COLS["inventory"].find_one({"inventory_id": inv_id}):
                product_name = batch.get("product_name", "Idli Batter")
                qty = int(batch.get("volume_kg", 1.0))
                COLS["inventory"].insert_one({
                    "inventory_id": inv_id,
                    "vendor_id": batch.get("vendor_id", ""),
                    "product_name": product_name,
                    "batch_number": batch.get("batch_number", batch_id),
                    "quantity": qty,
                    "minimum_stock": max(3, qty // 3),
                    "price": 120.0,
                    "manufacture_date": batch.get("mfg_timestamp", datetime.utcnow()),
                    "expiry_date": datetime.utcnow() + timedelta(hours=24),
                    "received_at": datetime.utcnow(),
                    "freshness_score": 0.1,
                })

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>", methods=["DELETE"])
def delete_batch(batch_id):
    try:
        COLS["batches"].delete_one({"batch_id": batch_id})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# INVENTORY
# ════════════════════════════════════════════════════════════════════
@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    docs = list(COLS["inventory"].find({}))
    # Resolve vendor shop names in one query (avoids N+1).
    vendor_ids = {d.get("vendor_id") for d in docs if d.get("vendor_id")}
    vendor_names = {}
    if vendor_ids:
        for v in COLS["vendors"].find(
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


# ════════════════════════════════════════════════════════════════════
# ORDERS
# ════════════════════════════════════════════════════════════════════
@app.route("/api/orders", methods=["GET"])
def get_orders():
    docs = list(COLS["orders"].find({}).sort("order_date", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


# ════════════════════════════════════════════════════════════════════
# ML: DEMAND FORECAST — Auto-derived from DB data
# ════════════════════════════════════════════════════════════════════
@app.route("/api/vendors/<vendor_id>/demand-forecast")
def demand_forecast(vendor_id):
    """Auto-derive demand forecast from real order/inventory data.
    
    Computes all 17 ML features from:
    - ORDERS.order_date → time features, lag, rolling averages
    - ORDER_ITEMS.quantity → actual units sold
    - INVENTORY.quantity → current stock
    - VENDORS → locality, hotspot, rating
    """
    vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404
    
    now = datetime.utcnow()
    product_name = "Idli Batter"  # default product
    
    # Get product from vendor's inventory
    inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    if inv_items:
        product_name = inv_items[0].get("product_name", "Idli Batter")
    
    # Compute features from real data
    feature_dict, available_stock, vendor_rating = compute_sales_features(
        vendor_id, product_name, now, "morning"
    )
    
    # Run ML model
    row = pd.DataFrame([feature_dict])[demand_features]
    predicted = max(0, round(float(demand_model.predict(row)[0]), 1))
    safety_stock = 5.0
    recommended_dispatch = max(0, round(predicted + safety_stock - available_stock, 1))
    
    # Compute summary stats
    total_stock = available_stock
    min_stock = sum(i.get("minimum_stock", 0) for i in inv_items)
    
    # Count orders for this vendor
    order_count = COLS["orders"].count_documents({"vendor_id": vendor_id})
    recent_orders = list(COLS["orders"].find({"vendor_id": vendor_id}).sort("order_date", -1).limit(30))
    historical_sales = len(recent_orders) * 15  # rough estimate
    
    return jsonify({
        "vendorId": vendor_id,
        "shopName": vendor.get("shop_name", ""),
        "predictedDemand": predicted,
        "recommendedDispatch": recommended_dispatch,
        "currentStock": total_stock,
        "minimumStock": min_stock,
        "lag1": feature_dict["lag1"],
        "lag7": feature_dict["lag7"],
        "rolling7DayMean": feature_dict["rolling7DayMean"],
        "sameSlot4WeekMean": feature_dict["sameSlot4WeekMean"],
        "recentTrend": feature_dict["recentTrend"],
        "historicalSales": historical_sales,
        "recentOrders": len(recent_orders),
        "dataSource": "ML Model (XGBoost) + DB order history",
    })


# ════════════════════════════════════════════════════════════════════
# ML: DEMAND FORECAST — Manual form input
# ════════════════════════════════════════════════════════════════════
@app.route("/api/predict-demand", methods=["POST"])
def predict_demand():
    try:
        data = request.json
        vendor_id = data.get("vendor_id", "V100")
        product_id = data.get("product_id", "Idly_Batter")
        product_id = PRODUCT_NAME_TO_ID.get(product_id, product_id)
        date_str = data.get("date", "2026-03-01")
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        window = data.get("window", "morning")
        temperature = float(data.get("temperature", 30.0))
        rain_prob = float(data.get("rainProbability", 0.2))
        locality = data.get("localityTier", "residential_budget")
        festival = data.get("festivalType", "none")
        hotspot_score = float(data.get("hotspotDensityScore", 30.0))
        available_stock = float(data.get("availableStock", 20.0))
        safety_stock = float(data.get("safetyStock", 5.0))
        lag1 = float(data.get("lag1", 20.0))
        lag7 = float(data.get("lag7", 18.0))
        rolling7_mean = float(data.get("rolling7DayMean", 19.0))
        rolling7_std = float(data.get("rolling7DayStd", 4.0))
        rolling28_mean = float(data.get("rolling28DayMean", 20.0))
        same_slot_4wk = float(data.get("sameSlot4WeekMean", 21.0))

        hour = 7 if window == "morning" else 17
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        weekday = target_date.weekday()
        weekday_sin = math.sin(2 * math.pi * weekday / 7)
        weekday_cos = math.cos(2 * math.pi * weekday / 7)
        is_weekend = 1 if weekday >= 5 else 0
        is_festival = 1 if festival != "none" else 0
        recent_trend = rolling7_mean / rolling28_mean if rolling28_mean > 0 else 1.0

        feature_dict = {
            "hourSin": round(hour_sin, 4), "hourCos": round(hour_cos, 4),
            "weekdaySin": round(weekday_sin, 4), "weekdayCos": round(weekday_cos, 4),
            "isWeekend": is_weekend, "isFestivalWindow": is_festival,
            "forecastTemperatureC": temperature, "forecastRainProbability": rain_prob,
            "lag1": lag1, "lag7": lag7,
            "rolling7DayMean": rolling7_mean, "rolling7DayStd": rolling7_std,
            "sameSlot4WeekMean": same_slot_4wk, "recentTrend": round(recent_trend, 4),
            "localityTierEnc": safe_encode(locality_encoder, locality, KNOWN_LOCALITIES),
            "hotspotDensityScore": hotspot_score,
            "productIdEnc": safe_encode(product_encoder, product_id, KNOWN_PRODUCTS),
        }

        row = pd.DataFrame([feature_dict])[demand_features]
        predicted_demand = max(0, round(float(demand_model.predict(row)[0]), 1))
        recommended_dispatch = max(0, round(predicted_demand + safety_stock - available_stock, 1))

        COLS["predictions"].insert_one({
            "predictionType": "DEMAND", "vendorId": vendor_id, "productId": product_id,
            "date": target_date, "window": window,
            "predictedValue": predicted_demand, "recommendedDispatch": recommended_dispatch,
            "inputFeatures": feature_dict, "modelVersion": "v1.0", "generatedAt": datetime.utcnow(),
        })

        return jsonify({
            "predictedDemand": predicted_demand, "recommendedDispatch": recommended_dispatch,
            "vendorId": vendor_id, "productId": product_id,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# ML: SPOILAGE RISK
# ════════════════════════════════════════════════════════════════════
@app.route("/api/predict-spoilage", methods=["POST"])
def predict_spoilage():
    try:
        data = request.json
        vendor_id = data.get("vendor_id", "V100")
        batch_id = data.get("batch_id", "B20000")
        product_id = data.get("product_id", "Idly_Batter")
        initial_ph = float(data.get("initialPH", 4.4))
        hours_since_mfg = float(data.get("hoursSinceManufacture", 48.0))
        has_refrigerator = int(data.get("hasRefrigerator", 1))
        storage_type = data.get("storageType", "counter")
        ambient_temp = float(data.get("ambientTemperatureC", 30.0))
        humidity = float(data.get("humidityPct", 65.0))
        fridge_temp = float(data.get("fridgeTemperatureC", 4.0 if has_refrigerator else -1.0))
        hours_on_shelf = float(data.get("hoursOnShelf", 24.0))
        sell_through = float(data.get("sellThroughRate", 0.5))
        hours_to_expiry = float(data.get("hoursToExpiry", 120.0))
        volume_kg = float(data.get("volumeKg", 1.0))
        vendor_rating = float(data.get("vendorRating", 4.0))

        temp_exposure = (fridge_temp if has_refrigerator else ambient_temp) * hours_since_mfg

        feature_dict = {
            "initialPH": initial_ph, "hoursSinceManufacture": hours_since_mfg,
            "hasRefrigerator": has_refrigerator,
            "storageTypeEnc": safe_encode(storage_encoder, storage_type, KNOWN_STORAGE),
            "ambientTemperatureC": ambient_temp, "humidityPct": humidity,
            "fridgeTemperatureC": fridge_temp, "hoursOnShelf": hours_on_shelf,
            "sellThroughRate": sell_through,
            "effectiveTemperatureExposure": round(temp_exposure, 1),
            "hoursToExpiry": hours_to_expiry, "volumeKg": volume_kg,
            "vendorRating": vendor_rating,
        }

        row = pd.DataFrame([feature_dict])[spoilage_features]
        pred_encoded = spoilage_model.predict(row)[0]
        risk_label = label_encoder.inverse_transform([pred_encoded])[0]
        proba = spoilage_model.predict_proba(row)[0]
        confidence = round(float(max(proba)) * 100, 1)

        COLS["predictions"].insert_one({
            "predictionType": "SPOILAGE_RISK", "vendorId": vendor_id, "batchId": batch_id,
            "productId": product_id, "predictedValue": risk_label, "confidence": confidence,
            "inputFeatures": feature_dict, "modelVersion": "v1.0", "generatedAt": datetime.utcnow(),
        })

        return jsonify({
            "riskLabel": risk_label, "confidence": confidence,
            "probabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
            "vendorId": vendor_id, "batchId": batch_id, "productId": product_id,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/predict-spoilage")
def predict_spoilage_for_batch(batch_id):
    """Auto-derived spoilage risk from real batch/vendor/inventory data.
    
    Computes all 13 ML features from:
    - BATCHES.initialPH, mfgTimestamp, volume_kg, temperatureC, humidityPct
    - VENDORS.hasRefrigerator, storageType, fridgeTemperatureC, rating
    - INVENTORY.quantity vs ORDER_ITEMS → sell-through rate
    - Derived: hoursSinceManufacture, hoursOnShelf, effectiveTempExposure
    """
    batch = COLS["batches"].find_one({"batch_id": batch_id})
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    vendor = COLS["vendors"].find_one({"vendor_id": batch.get("vendor_id")})
    now = datetime.utcnow()

    # ── Hours since manufacture (from BATCHES.mfgTimestamp) ──
    mfg = batch.get("mfg_timestamp", now)
    if isinstance(mfg, str):
        mfg = parse_date(mfg)
    hours_since_mfg = max(0, (now - mfg).total_seconds() / 3600)

    # ── Vendor storage details (from VENDORS) ──
    has_fridge = 1 if vendor and vendor.get("hasRefrigerator") else 0
    fridge_temp = vendor.get("fridgeTemperatureC", 4.5) if vendor and has_fridge else -1
    ambient_temp = batch.get("temperatureC", 31.0)
    storage_type = vendor.get("storageType", "counter") if vendor else "counter"
    humidity = batch.get("humidityPct", 65.0)
    vendor_rating = vendor.get("rating", 4.0) if vendor else 4.0

    # ── Hours on shelf (from INVENTORY.received_at) ──
    inv_item = COLS["inventory"].find_one({"batch_number": batch.get("batch_number", batch_id)})
    hours_on_shelf = hours_since_mfg * 0.8  # default
    if inv_item:
        received = inv_item.get("received_at", now)
        if isinstance(received, str):
            received = parse_date(received)
        hours_on_shelf = max(0, (now - received).total_seconds() / 3600)

    # ── Hours to expiry (from INVENTORY.expiry_date) ──
    hours_to_expiry = max(0, 24 - hours_since_mfg)  # default
    if inv_item and inv_item.get("expiry_date"):
        expiry = inv_item["expiry_date"]
        if isinstance(expiry, str):
            expiry = parse_date(expiry)
        hours_to_expiry = max(0, (expiry - now).total_seconds() / 3600)

    # ── Sell-through rate (from ORDER_ITEMS / INVENTORY.quantity) ──
    vendor_id = batch.get("vendor_id", "")
    order_count = COLS["orders"].count_documents({"vendor_id": vendor_id}) if vendor_id else 0
    batch_qty = inv_item.get("quantity", 10) if inv_item else batch.get("volume_kg", 1.0)
    sell_through = min(1.0, order_count / max(1, batch_qty + order_count))

    # ── Effective temperature exposure ──
    temp_exposure = (fridge_temp if has_fridge else ambient_temp) * hours_since_mfg

    # ── Build 13-feature dict for ML model ──
    feature_dict = {
        "initialPH": batch.get("initialPH", 4.4),
        "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hasRefrigerator": has_fridge,
        "storageTypeEnc": safe_encode(storage_encoder, storage_type, KNOWN_STORAGE),
        "ambientTemperatureC": ambient_temp,
        "humidityPct": humidity,
        "fridgeTemperatureC": fridge_temp,
        "hoursOnShelf": round(hours_on_shelf, 1),
        "sellThroughRate": round(sell_through, 2),
        "effectiveTemperatureExposure": round(temp_exposure, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "volumeKg": batch.get("volume_kg", 1.0),
        "vendorRating": vendor_rating,
    }

    # ── Run ML model ──
    row = pd.DataFrame([feature_dict])[spoilage_features]
    pred_enc = spoilage_model.predict(row)[0]
    risk_label = label_encoder.inverse_transform([pred_enc])[0]
    proba = spoilage_model.predict_proba(row)[0]
    confidence = round(float(max(proba)) * 100, 1)

    # ── Freshness score from DB (or compute from hours) ──
    fs = 0.1
    if inv_item and inv_item.get("freshness_score") is not None:
        fs = inv_item["freshness_score"]
    else:
        fs = min(1.0, hours_since_mfg / 24.0)
    fs_risk = "Low" if fs < 0.3 else "Medium" if fs <= 0.7 else "High"

    return jsonify({
        "batchId": batch_id,
        "productId": batch.get("product_name", ""),
        "vendorId": vendor_id,
        "vendorName": vendor.get("shop_name", "") if vendor else "",
        "mlRiskLabel": risk_label,
        "mlConfidence": confidence,
        "mlProbabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
        "freshnessScore": round(fs, 2),
        "freshnessRisk": fs_risk,
        "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "sellThroughRate": round(sell_through, 2),
        "dataSource": "ML Model (Random Forest) + DB batch/vendor/inventory data",
    })


# ════════════════════════════════════════════════════════════════════
# ML: HISTORY & STATS
# ════════════════════════════════════════════════════════════════════
@app.route("/api/history", methods=["GET"])
def get_history():
    limit = int(request.args.get("limit", 50))
    cursor = COLS["predictions"].find({}).sort("generatedAt", -1).limit(limit)
    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("generatedAt"), datetime):
            doc["generatedAt"] = doc["generatedAt"].isoformat()
        if isinstance(doc.get("date"), datetime):
            doc["date"] = doc["date"].isoformat()
        results.append(doc)
    return jsonify(results)


@app.route("/api/stats", methods=["GET"])
def get_stats():
    total = COLS["predictions"].count_documents({})
    demand_count = COLS["predictions"].count_documents({"predictionType": "DEMAND"})
    spoilage_count = COLS["predictions"].count_documents({"predictionType": "SPOILAGE_RISK"})
    return jsonify({
        "totalPredictions": total,
        "demandPredictions": demand_count,
        "spoilagePredictions": spoilage_count,
    })



# ════════════════════════════════════════════════════════════════════
# SERVE UI
# ════════════════════════════════════════════════════════════════════
@app.route("/")
def index():
    if "user" not in session:
        return send_from_directory("static", "login.html")
    return send_from_directory("static", "index.html")


@app.route("/vendor")
def vendor_page():
    return send_from_directory("static", "vendor.html")


# ════════════════════════════════════════════════════════════════════
# RUN
# ════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print("\n  B2P Platform starting on http://localhost:5000\n")
    threaded = not debug  # dev reloader already forks; use threads in normal runs
    # For production, prefer a real WSGI server:
    #   gunicorn -w 4 -b 0.0.0.0:5000 --threads 2 app:app
    app.run(host="0.0.0.0", port=5000, debug=debug, threaded=threaded,
            use_reloader=debug)
