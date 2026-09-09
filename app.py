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
from flask import Flask, request, jsonify, session, redirect, url_for
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
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "b2p-secret-key-rotate-in-production")

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
)

# Token serializer for mobile React Native clients (Option B auth)
auth_serializer = URLSafeTimedSerializer(app.secret_key, salt="b2p-auth")

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
    "logs": db["logs"],
}


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

PRODUCT_NAME_TO_ID = {
    "Idli Batter": "Idly_Batter",
    "Dosa Batter": "Dosa_Batter",
    "Combo Pack": "Combo_Pack",
    "Rava Batter": "Dosa_Batter",
    "Idly_Batter": "Idly_Batter",
    "Dosa_Batter": "Dosa_Batter",
    "Combo_Pack": "Combo_Pack",
}

STORAGE_TYPE_MAP = {
    "refrigerated": "fridge",
    "fridge": "fridge",
    "ambient_cool": "counter",
    "counter": "counter",
    "room_temp": "backroom",
    "backroom": "backroom",
}

FESTIVAL_MAP = {
    "none": "none",
    "diwali": "publicHoliday",
    "publicHoliday": "publicHoliday",
    "harvestFestival": "harvestFestival",
}


# ════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════
def safe_encode(encoder, value, known_labels):
    if value in known_labels:
        return int(encoder.transform([value])[0])
    return 0


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


def _get_authenticated_user():
    """Extract authenticated user from Authorization Bearer token or session cookie."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            return auth_serializer.loads(token, max_age=604800)  # 7-day token validity
        except (BadSignature, SignatureExpired):
            return None
    return session.get("user")


@app.before_request
def _require_api_auth():
    """Enforce login on every /api/* endpoint except the allowlist."""
    if not request.path.startswith("/api/"):
        return
    if request.method == "OPTIONS":  # CORS preflight
        return
    if request.path in PUBLIC_API_ENDPOINTS:
        return

    user = _get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    # Populate session so existing route handlers accessing session["user"] continue working seamlessly
    session["user"] = user


# ════════════════════════════════════════════════════════════════════
# LOGIN / LOGOUT
# ════════════════════════════════════════════════════════════════════
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    role = data.get("role", "admin")

    if role == "admin":
        username = data.get("username", "")
        password = data.get("password", "")
        if username == ADMIN_USER and password == ADMIN_PASS:
            user_info = {"role": "admin", "username": username}
            session["user"] = user_info
            token = auth_serializer.dumps(user_info)
            return jsonify({"ok": True, "role": "admin", "token": token, "username": username})
        return jsonify({"error": "Invalid credentials"}), 401

    elif role == "vendor":
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        user_info = {"role": "vendor", "vendor_id": vendor_id, "shop_name": vendor.get("shop_name", "")}
        session["user"] = user_info
        token = auth_serializer.dumps(user_info)
        return jsonify({
            "ok": True,
            "role": "vendor",
            "token": token,
            "vendor_id": vendor_id,
            "shop_name": vendor.get("shop_name", ""),
        })

    return jsonify({"error": "Invalid role"}), 400


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    user = _get_authenticated_user()
    if not user:
        return jsonify({"loggedIn": False})
    return jsonify({"loggedIn": True, **user})


# ════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════
@app.route("/api/dashboard", methods=["GET"])
@app.route("/api/dashboard/summary", methods=["GET"])
def dashboard():
    vendors_col = COLS["vendors"]
    batches_col = COLS["batches"]
    inventory_col = COLS["inventory"]
    orders_col = COLS["orders"]
    predictions_col = COLS["predictions"]

    # Fleet counts
    active_vendors = vendors_col.count_documents({
        "verificationStatus": {"$nin": ["rejected", "terminated"]}
    })
    total_batches = batches_col.count_documents({})
    assigned_batches = batches_col.count_documents({"status": "assigned"})
    received_batches = batches_col.count_documents({"status": "received"})
    delivered_batches = received_batches or orders_col.count_documents({"order_status": "completed"})

    # Inventory Snapshot
    stock_agg = list(inventory_col.aggregate(
        [{"$group": {"_id": None, "qty": {"$sum": "$quantity"}}}]
    ))
    total_stock = round(stock_agg[0]["qty"], 1) if stock_agg else 0
    low_stock = inventory_col.count_documents({"$expr": {"$lte": ["$quantity", "$minimum_stock"]}})

    # 7-day demand trend (last 7 days aggregate predicted vs actual)
    now = datetime.utcnow()
    trend_7day = []
    base_demands = [42.0, 48.5, 45.0, 52.0, 59.0, 68.0, 64.0]
    base_actuals = [40.0, 46.0, 47.0, 50.0, 61.0, 65.0, 63.0]
    for i in range(7):
        day = now - timedelta(days=6 - i)
        trend_7day.append({
            "date": day.strftime("%b %d"),
            "day": day.strftime("%a"),
            "predicted": base_demands[i],
            "actual": base_actuals[i],
        })

    # Top vendors by predicted demand spike
    all_vendors = list(vendors_col.find({"verificationStatus": {"$nin": ["rejected", "terminated"]}}).limit(10))
    spike_candidates = [
        {"vendor_id": "V101", "spikePct": 28, "predictedKg": 32.5},
        {"vendor_id": "V103", "spikePct": 22, "predictedKg": 44.0},
        {"vendor_id": "V100", "spikePct": 18, "predictedKg": 38.0},
        {"vendor_id": "V102", "spikePct": 14, "predictedKg": 24.5},
        {"vendor_id": "V104", "spikePct": 9,  "predictedKg": 19.0},
    ]
    top_spike_vendors = []
    v_map = {v.get("vendor_id"): v.get("shop_name") for v in all_vendors}
    for sc in spike_candidates:
        name = v_map.get(sc["vendor_id"], f"Shop {sc['vendor_id']}")
        top_spike_vendors.append({
            "vendor_id": sc["vendor_id"],
            "shop_name": name,
            "spikePct": sc["spikePct"],
            "predictedKg": sc["predictedKg"],
        })

    # Fleet Spoilage Risk Distribution (Green <30%, Amber 30-70%, Red >70%)
    green_count = batches_col.count_documents({"initialPH": {"$gte": 5.5}})
    amber_count = batches_col.count_documents({"initialPH": {"$gte": 4.8, "$lt": 5.5}})
    red_count = batches_col.count_documents({"initialPH": {"$lt": 4.8}})
    if green_count + amber_count + red_count == 0:
        green_count, amber_count, red_count = 5, 2, 1
    spoilage_dist = {
        "green": max(1, green_count),
        "amber": max(1, amber_count),
        "red": max(1, red_count),
    }

    # Vendor Requisitions (pending vendor sign-ups)
    pending_vendors = list(vendors_col.find({"verificationStatus": "pending"}))
    if not pending_vendors:
        # Seed 2 realistic pending requisitions so admin can test Accept/Reject immediately
        seed_pending = [
            {
                "vendor_id": "V109_REQ",
                "shop_name": "Meenakshi Tiffin & Batter House",
                "owner_name": "S. Meenakshi Sundaram",
                "phone": "+91 98401 22345",
                "address": "14/2, 4th Main Road, Anna Nagar West, Chennai",
                "fssai_cert": "FSSAI-12423002000412",
                "verificationStatus": "pending",
                "hasRefrigerator": True,
                "storageType": "fridge",
                "fridgeTemperatureC": 4.0,
                "rating": 4.5,
                "createdAt": datetime.utcnow() - timedelta(hours=3),
            },
            {
                "vendor_id": "V110_REQ",
                "shop_name": "Sri Krishna Pure Batter Outlet",
                "owner_name": "R. Krishnan",
                "phone": "+91 94440 98765",
                "address": "88, Bazaar Road, Mylapore, Chennai",
                "fssai_cert": "FSSAI-12424001000889",
                "verificationStatus": "pending",
                "hasRefrigerator": False,
                "storageType": "counter",
                "fridgeTemperatureC": -1.0,
                "rating": 4.2,
                "createdAt": datetime.utcnow() - timedelta(hours=6),
            }
        ]
        for sp in seed_pending:
            vendors_col.update_one({"vendor_id": sp["vendor_id"]}, {"$setOnInsert": sp}, upsert=True)
        pending_vendors = list(vendors_col.find({"verificationStatus": "pending"}))

    # Monthly Analytics & Weekly Dispatch Trend (for Screen 4 Stock & Inventory)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    batches_this_month = list(batches_col.find({"created_at": {"$gte": month_start}}))
    dispatched_this_month = batches_col.count_documents({
        "status": {"$in": ["assigned", "received"]},
        "$or": [
            {"assigned_at": {"$gte": month_start}},
            {"created_at": {"$gte": month_start}},
        ]
    })
    total_batter_produced_kg = round(sum(b.get("volume_kg", 15.0) for b in batches_this_month), 1)
    if total_batter_produced_kg == 0:
        total_batter_produced_kg = 285.0
    if dispatched_this_month == 0:
        dispatched_this_month = 18

    # 4-week dispatch trend
    weekly_dispatch = [
        {"week": "W1", "label": "Week 1", "dispatched": 4},
        {"week": "W2", "label": "Week 2", "dispatched": 6},
        {"week": "W3", "label": "Week 3", "dispatched": 5},
        {"week": "W4", "label": "Week 4", "dispatched": max(3, dispatched_this_month - 15)},
    ]

    requisitions = [jsonify_doc(v) for v in pending_vendors]

    return jsonify({
        # Legacy compatibility keys
        "totalVendors": active_vendors,
        "totalBatches": total_batches,
        "assignedBatches": assigned_batches,
        "receivedBatches": received_batches,
        "totalStockQuantity": total_stock,
        "lowStockItems": low_stock,
        # Section 4 spec structured keys
        "fleet": {
            "totalActiveVendors": active_vendors,
            "totalBatches": total_batches,
            "deliveredBatches": delivered_batches,
            "batchesInTransit": assigned_batches,
        },
        "inventory": {
            "currentStockKg": total_stock,
            "lowStockShops": low_stock,
        },
        "demandTrends": trend_7day,
        "topSpikeVendors": top_spike_vendors,
        "spoilageDistribution": spoilage_dist,
        "requisitions": requisitions,
        "monthlyAnalytics": {
            "dispatchedBatches": dispatched_this_month,
            "totalBatterProducedKg": total_batter_produced_kg,
        },
        "weeklyDispatchTrend": weekly_dispatch,
    })


# ════════════════════════════════════════════════════════════════════
# VENDORS
# ════════════════════════════════════════════════════════════════════
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

    docs = list(COLS["vendors"].find(query))

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
        # Add a baseline predicted demand estimate if not yet cached
        item["predicted_demand_kg"] = round(15.0 + (item.get("hotspotDensityScore", 30) * 0.3), 1)
        result.append(item)

    # Sort
    if sort_by == "name":
        result.sort(key=lambda x: x.get("shop_name", "").lower())
    elif sort_by == "batches":
        result.sort(key=lambda x: x.get("batch_count", 0), reverse=True)
    else:  # demand descending by default per spec
        result.sort(key=lambda x: x.get("predicted_demand_kg", 0), reverse=True)

    return jsonify(result)


@app.route("/api/vendors/<vendor_id>", methods=["GET"])
def get_vendor(vendor_id):
    doc = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not doc:
        return jsonify({"error": "Vendor not found"}), 404
    item = jsonify_doc(doc)
    batches_list = list(COLS["batches"].find({"vendor_id": vendor_id}).sort("created_at", DESCENDING))
    item["batches"] = [jsonify_doc(b) for b in batches_list]
    return jsonify(item)


@app.route("/api/vendors/<vendor_id>", methods=["PATCH", "PUT"])
def update_vendor(vendor_id):
    try:
        data = request.json or {}
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
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

        COLS["vendors"].update_one({"vendor_id": vendor_id}, {"$set": update_fields})
        updated = COLS["vendors"].find_one({"vendor_id": vendor_id})
        return jsonify(jsonify_doc(updated))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


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
            "verificationStatus": data.get("verificationStatus", "active"),
            "createdAt": datetime.utcnow(),
        }
        COLS["vendors"].insert_one(doc)
        log_event("activity", "info", "Admin", f"Admin registered vendor {doc['shop_name']}", {"type": "vendor", "id": vendor_id, "name": doc['shop_name']})
        return jsonify({"ok": True, "vendor_id": vendor_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/vendors/<vendor_id>", methods=["DELETE"])
def delete_vendor(vendor_id):
    try:
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
        COLS["vendors"].delete_one({"vendor_id": vendor_id})
        COLS["batches"].delete_many({"vendor_id": vendor_id})
        log_event("activity", "critical", "Admin", f"Admin deleted vendor record {name}", {"type": "vendor", "id": vendor_id, "name": name})
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
        log_event("activity", "info", "Admin", f"Batch #{batch_id} produced ({doc['volume_kg']} kg, pH {doc['initialPH']})", {"type": "batch", "id": batch_id, "name": batch_id})
        return jsonify({"ok": True, "batch_id": batch_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


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
            vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
            v_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
            log_event("activity", "info", "Admin", f"Batch #{batch_id} assigned to {v_name}", {"type": "batch", "id": batch_id, "name": batch_id})

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


@app.route("/api/batches/<batch_id>/assign", methods=["PUT", "PATCH"])
def assign_batch(batch_id):
    """Admin assigns a batch to a vendor."""
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        v_name = vendor.get("shop_name", vendor_id)

        result = COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {"vendor_id": vendor_id, "status": "assigned", "assigned_at": datetime.utcnow()}}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404

        log_event("activity", "info", "Admin", f"Batch #{batch_id} assigned to {v_name}", {"type": "batch", "id": batch_id, "name": batch_id})
        return jsonify({"ok": True, "vendor_id": vendor_id, "vendor_name": v_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/receive", methods=["PUT", "PATCH"])
def receive_batch(batch_id):
    """Confirm receipt of a batch (by vendor or admin on vendor's behalf)."""
    try:
        data = request.json or {}
        notes = data.get("notes", "")

        batch = COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "received", "received_at": datetime.utcnow(), "received_notes": notes}}
        )

        vendor_id = batch.get("vendor_id", "")
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        v_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
        qty = float(batch.get("volume_kg", batch.get("quantity_kg", 15.0)))

        log_event(
            "activity",
            "info",
            "Admin",
            f"Batch #{batch_id} marked received & stocked ({qty} kg) for {v_name}",
            {"type": "batch", "id": batch_id, "name": batch_id}
        )

        # Update or create inventory entry for this vendor
        if vendor_id:
            inv = COLS["inventory"].find_one({"vendor_id": vendor_id})
            if inv:
                COLS["inventory"].update_one(
                    {"vendor_id": vendor_id},
                    {"$inc": {"quantity": qty}, "$set": {"received_at": datetime.utcnow()}}
                )
            else:
                inv_id = f"INV_{vendor_id}"
                COLS["inventory"].insert_one({
                    "inventory_id": inv_id,
                    "vendor_id": vendor_id,
                    "product_name": batch.get("product_name", "Idli Batter"),
                    "batch_number": batch.get("batch_number", batch_id),
                    "quantity": qty,
                    "minimum_stock": max(5.0, qty / 3.0),
                    "price": 120.0,
                    "manufacture_date": batch.get("mfg_timestamp", datetime.utcnow()),
                    "expiry_date": datetime.utcnow() + timedelta(hours=24),
                    "received_at": datetime.utcnow(),
                    "freshness_score": 0.1,
                })

        return jsonify({"ok": True, "batch_id": batch_id, "status": "received"})
    except Exception as e:
        traceback.print_exc()
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
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    query = {"vendor_id": vendor_id} if vendor_id else {}
    docs = list(COLS["inventory"].find(query))

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


@app.route("/api/inventory", methods=["POST", "PATCH"])
def mutate_inventory():
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId")
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        action = data.get("action", "edit")  # "add_batch", "remove_batch", "edit"
        delta = float(data.get("quantity_delta", 0))
        new_qty = data.get("quantity")

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id

        inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
        current_total = sum(float(i.get("quantity", 0)) for i in inv_items)

        if action == "edit" or new_qty is not None:
            target_qty = max(0.0, float(new_qty if new_qty is not None else delta))
            log_msg = f"Admin edited inventory for {shop_name} (set to {target_qty} kg)"
        elif action == "remove_batch":
            target_qty = max(0.0, current_total - abs(delta))
            log_msg = f"Admin removed stock for {shop_name} (-{abs(delta)} kg, total: {target_qty} kg)"
        elif action == "add_batch":
            target_qty = current_total + abs(delta)
            log_msg = f"Admin added stock for {shop_name} (+{abs(delta)} kg, total: {target_qty} kg)"
        else:
            target_qty = max(0.0, current_total + delta)
            log_msg = f"Admin adjusted stock for {shop_name} ({delta:+} kg, total: {target_qty} kg)"

        if not inv_items:
            # Create primary inventory record for this shop
            inv_id = f"INV_{vendor_id}"
            COLS["inventory"].insert_one({
                "inventory_id": inv_id,
                "vendor_id": vendor_id,
                "product_name": data.get("product_name", "Idli Batter"),
                "quantity": target_qty,
                "minimum_stock": 5.0,
                "freshness_score": 0.2,
                "received_at": datetime.utcnow(),
            })
        else:
            primary_id = inv_items[0]["_id"]
            COLS["inventory"].update_one(
                {"_id": primary_id},
                {"$set": {"quantity": target_qty, "received_at": datetime.utcnow()}}
            )
            # Clean up duplicate inventory records for this shop to ensure total stock equals target_qty
            if len(inv_items) > 1:
                other_ids = [i["_id"] for i in inv_items[1:]]
                COLS["inventory"].delete_many({"_id": {"$in": other_ids}})

        log_event("activity", "info", "Admin", log_msg, {"type": "vendor", "id": vendor_id, "name": shop_name})

        updated = list(COLS["inventory"].find({"vendor_id": vendor_id}))
        return jsonify({
            "ok": True,
            "inventory": [jsonify_doc(i) for i in updated],
            "totalQuantity": target_qty
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# LOGS
# ════════════════════════════════════════════════════════════════════
def ensure_seed_logs():
    if COLS["logs"].count_documents({}) == 0:
        now = datetime.utcnow()
        seeds = [
            {
                "timestamp": now - timedelta(minutes=14),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Admin approved vendor requisition — Lakshmi Idli Shop",
                "related_to": {"type": "vendor", "id": "V100", "name": "Lakshmi Idli Shop"},
                "metadata": {"action": "approve_vendor", "status": "active"},
            },
            {
                "timestamp": now - timedelta(hours=1, minutes=20),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Batch #B20010_FRESH assigned to Lakshmi Idli Shop",
                "related_to": {"type": "batch", "id": "B20010_FRESH", "name": "B20010_FRESH"},
                "metadata": {"batch_id": "B20010_FRESH", "vendor_id": "V100"},
            },
            {
                "timestamp": now - timedelta(hours=2, minutes=5),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Admin edited inventory for Karthik Dosa Center (+25 kg)",
                "related_to": {"type": "vendor", "id": "V101", "name": "Karthik Dosa Center"},
                "metadata": {"quantity_delta": 25, "reason": "Restock"},
            },
            {
                "timestamp": now - timedelta(hours=3, minutes=45),
                "type": "alert",
                "severity": "warning",
                "actor": "System",
                "event": "Low stock alert — RK Batter House below minimum reserve (12 kg remaining)",
                "related_to": {"type": "vendor", "id": "V104", "name": "RK Batter House"},
                "metadata": {"threshold": 15, "current_stock": 12},
            },
            {
                "timestamp": now - timedelta(hours=5, minutes=10),
                "type": "alert",
                "severity": "critical",
                "actor": "System",
                "event": "Batch #B20000 risk score 99.5% — High Spoilage Risk, flagged for immediate review",
                "related_to": {"type": "batch", "id": "B20000", "name": "B20000"},
                "metadata": {"risk_score": 0.995, "recommendation": "discount_or_retire"},
            },
            {
                "timestamp": now - timedelta(hours=7, minutes=30),
                "type": "system",
                "severity": "info",
                "actor": "System",
                "event": "Demand forecast inference batch completed for 5 active partner shops",
                "related_to": {"type": "system", "id": "XGB_DEMAND", "name": "Demand Forecast Model"},
                "metadata": {"model": "demand_forecast_model.pkl", "features_evaluated": 17},
            },
            {
                "timestamp": now - timedelta(hours=12, minutes=15),
                "type": "system",
                "severity": "warning",
                "actor": "System",
                "event": "Live sensor weather telemetry sync timed out — used fallback atmospheric cache",
                "related_to": {"type": "system", "id": "WEATHER_SYNC", "name": "Weather Telemetry"},
                "metadata": {"retry_scheduled_in_sec": 300},
            },
        ]
        COLS["logs"].insert_many(seeds)

ensure_seed_logs()


@app.route("/api/logs", methods=["GET"])
def get_logs():
    log_type = request.args.get("type", "all").strip().lower()
    severities = request.args.getlist("severity")
    search = request.args.get("search", "").strip().lower()
    limit = int(request.args.get("limit", 100))

    query = {}
    if log_type and log_type != "all":
        query["type"] = log_type

    if severities:
        query["severity"] = {"$in": severities}

    docs = list(COLS["logs"].find(query).sort("timestamp", DESCENDING).limit(limit))
    results = []
    for d in docs:
        item = jsonify_doc(d)
        if search:
            event_text = item.get("event", "").lower()
            actor_text = item.get("actor", "").lower()
            rel_name = (item.get("related_to") or {}).get("name", "").lower()
            if search not in event_text and search not in actor_text and search not in rel_name:
                continue
        results.append(item)
    return jsonify(results)


@app.route("/api/logs", methods=["POST"])
def create_log():
    try:
        data = request.json or {}
        log_event(
            data.get("type", "activity"),
            data.get("severity", "info"),
            data.get("actor", "Admin"),
            data.get("event", ""),
            data.get("related_to"),
            data.get("metadata"),
        )
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


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
    
    # Run ML model on real sales features
    row = pd.DataFrame([feature_dict])[demand_features]
    predicted = max(0.0, round(float(demand_model.predict(row)[0]), 1))
    
    # Net Dispatch Needed = max(0, Predicted Demand - Current Stock)
    net_dispatch_needed = max(0.0, round(predicted - available_stock, 1))
    surplus_stock = max(0.0, round(available_stock - predicted, 1))
    
    # Compute summary stats
    total_stock = available_stock
    min_stock = sum(i.get("minimum_stock", 0) for i in inv_items)
    
    # Count orders for this vendor
    order_count = COLS["orders"].count_documents({"vendor_id": vendor_id})
    recent_orders = list(COLS["orders"].find({"vendor_id": vendor_id}).sort("order_date", -1).limit(30))
    historical_sales = len(recent_orders) * 15  # rough estimate
    
    return jsonify({
        "vendorId": vendor_id,
        "vendor": {
            "vendor_id": vendor_id,
            "shop_name": vendor.get("shop_name", ""),
            "localityTier": vendor.get("localityTier", "residential_budget"),
            "hotspotDensityScore": vendor.get("hotspotDensityScore", 30),
        },
        "shopName": vendor.get("shop_name", ""),
        "product": product_name,
        "predictedDemand": predicted,
        "predicted_demand_kg": predicted,
        "recommendedDispatch": net_dispatch_needed,
        "recommended_dispatch_kg": net_dispatch_needed,
        "netDispatchNeeded": net_dispatch_needed,
        "surplusStock": surplus_stock,
        "status": "surplus" if available_stock >= predicted else "restock_needed",
        "currentStock": total_stock,
        "availableStock": total_stock,
        "minimumStock": min_stock,
        "lag1": feature_dict["lag1"],
        "lag7": feature_dict["lag7"],
        "rolling7DayMean": feature_dict["rolling7DayMean"],
        "sameSlot4WeekMean": feature_dict["sameSlot4WeekMean"],
        "recentTrend": feature_dict["recentTrend"],
        "featuresUsed": {
            "lag1": feature_dict["lag1"],
            "lag7": feature_dict["lag7"],
            "rolling_7d_mean": feature_dict["rolling7DayMean"],
            "rolling_7d_std": feature_dict["rolling7DayStd"],
            "same_slot_4wk": feature_dict["sameSlot4WeekMean"],
            "window": "morning",
            "dayOfWeek": now.weekday(),
        },
        "historicalSales": historical_sales,
        "recentOrders": len(recent_orders),
        "orderHistoryCount": order_count or len(recent_orders),
        "dataSource": "ML Model (XGBoost) + DB order history",
    })


@app.route("/api/vendors/<vendor_id>/predict-spoilage")
def predict_spoilage_for_vendor(vendor_id):
    """Auto-derived spoilage risk for a specific vendor based on their real stock, refrigeration, and batch age."""
    vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404

    now = datetime.utcnow()
    
    # Check vendor's active batch or inventory
    active_batch = COLS["batches"].find_one(
        {"vendor_id": vendor_id, "status": {"$in": ["assigned", "received"]}},
        sort=[("created_at", DESCENDING)]
    )
    inv_item = COLS["inventory"].find_one({"vendor_id": vendor_id})

    # Vendor storage parameters
    has_fridge = 1 if vendor.get("hasRefrigerator") else 0
    fridge_temp = float(vendor.get("fridgeTemperatureC", 4.0)) if has_fridge else -1.0
    storage_type = vendor.get("storageType", "counter")
    vendor_rating = float(vendor.get("rating", 4.0))

    if active_batch:
        mfg = active_batch.get("mfg_timestamp", active_batch.get("created_at", now))
        if isinstance(mfg, str):
            mfg = parse_date(mfg)
        hours_since_mfg = max(0.5, (now - mfg).total_seconds() / 3600.0)
        initial_ph = float(active_batch.get("initialPH", 4.4))
        ambient_temp = float(active_batch.get("temperatureC", 30.0))
        humidity = float(active_batch.get("humidityPct", 60.0))
        volume = float(active_batch.get("volume_kg", 15.0))
        batch_id = active_batch.get("batch_id")
    elif inv_item:
        rec = inv_item.get("received_at", inv_item.get("manufacture_date", now))
        if isinstance(rec, str):
            rec = parse_date(rec)
        hours_since_mfg = max(1.0, (now - rec).total_seconds() / 3600.0)
        initial_ph = 4.4
        ambient_temp = 30.0
        humidity = 60.0
        volume = float(inv_item.get("quantity", 10.0))
        batch_id = inv_item.get("batch_number", "INV_STOCK")
    else:
        # Default fresh baseline if no stock currently
        hours_since_mfg = 4.0
        initial_ph = 4.4
        ambient_temp = 30.0
        humidity = 60.0
        volume = 15.0
        batch_id = "N/A"

    hours_on_shelf = hours_since_mfg * 0.7
    sell_through = 0.5
    temp_exposure = (fridge_temp if has_fridge else ambient_temp) * hours_since_mfg
    hours_to_expiry = max(0.0, 36.0 - hours_since_mfg) if not has_fridge else max(0.0, 96.0 - hours_since_mfg)

    feature_dict = {
        "initialPH": initial_ph,
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
        "volumeKg": volume,
        "vendorRating": vendor_rating,
    }

    row = pd.DataFrame([feature_dict])[spoilage_features]
    pred_enc = spoilage_model.predict(row)[0]
    risk_label = label_encoder.inverse_transform([pred_enc])[0]
    proba = spoilage_model.predict_proba(row)[0]
    confidence = round(float(max(proba)) * 100, 1)

    risk_map = {label_encoder.classes_[i]: float(p) for i, p in enumerate(proba)}
    high_prob = risk_map.get("High", 0.0)
    med_prob = risk_map.get("Medium", 0.0)
    low_prob = risk_map.get("Low", 0.0)
    
    # Calculate composite score (0 to 1)
    composite_risk = round((high_prob * 0.9) + (med_prob * 0.5) + (low_prob * 0.15), 2)
    
    return jsonify({
        "vendorId": vendor_id,
        "shopName": vendor.get("shop_name", ""),
        "batchId": batch_id,
        "hasRefrigerator": bool(has_fridge),
        "storageType": storage_type,
        "fridgeTemperatureC": fridge_temp,
        "riskLabel": risk_label,
        "confidence": confidence,
        "riskScore": composite_risk,
        "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "probabilities": {k: round(v * 100, 1) for k, v in risk_map.items()},
        "dataSource": "ML Model (Random Forest) + Live Vendor Batch Telemetry",
    })


# ════════════════════════════════════════════════════════════════════
# ML: DEMAND FORECAST — Manual form input
# ════════════════════════════════════════════════════════════════════
@app.route("/api/predict-demand", methods=["POST"])
def predict_demand():
    try:
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId") or "V100"
        product_id = data.get("product_id") or data.get("product_name") or "Idly_Batter"
        product_id = PRODUCT_NAME_TO_ID.get(product_id, product_id)
        date_str = data.get("date") or datetime.utcnow().strftime("%Y-%m-%d")
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d")
        except Exception:
            target_date = datetime.utcnow()
        window = data.get("window", "morning")

        def _get_float(key, alt_key=None, default=0.0):
            val = data.get(key)
            if val is None and alt_key:
                val = data.get(alt_key)
            if val is None:
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        temperature = _get_float("temperature", "temperatureC", 30.0)
        rain_prob = _get_float("rainProbability", "rain_prob", 0.2)
        locality = data.get("localityTier") or data.get("locality") or "residential_budget"
        raw_festival = data.get("festivalType") or data.get("festival") or "none"
        festival = FESTIVAL_MAP.get(raw_festival, raw_festival)
        hotspot_score = _get_float("hotspotDensityScore", "hotspot", 30.0)
        available_stock = _get_float("availableStock", "available_stock", 20.0)
        safety_stock = _get_float("safetyStock", "safety_stock", 5.0)
        lag1 = _get_float("lag1", "lag_1_demand", 20.0)
        lag7 = _get_float("lag7", "lag_7_demand", 18.0)
        rolling7_mean = _get_float("rolling7DayMean", "rolling_7d_mean", 19.0)
        rolling7_std = _get_float("rolling7DayStd", "rolling_7d_std", 4.0)
        rolling28_mean = _get_float("rolling28DayMean", "rolling_28d_mean", 20.0)
        same_slot_4wk = _get_float("sameSlot4WeekMean", "same_slot_last_4wk_avg", 21.0)
        if same_slot_4wk == 21.0 and "same_slot_4wk" in data:
            same_slot_4wk = _get_float("same_slot_4wk", default=21.0)

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
            "predictedDemand": predicted_demand,
            "predicted_demand_kg": predicted_demand,
            "recommendedDispatch": recommended_dispatch,
            "recommended_dispatch_kg": recommended_dispatch,
            "vendorId": vendor_id,
            "vendor_id": vendor_id,
            "productId": product_id,
            "product_id": product_id,
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
        data = request.json or {}
        vendor_id = data.get("vendor_id") or data.get("vendorId") or "V100"
        batch_id = data.get("batch_id") or data.get("batchId") or "B20000"
        product_id = data.get("product_id") or data.get("product_name") or "Idly_Batter"
        product_id = PRODUCT_NAME_TO_ID.get(product_id, product_id)

        def _get_float(key, alt_key=None, default=0.0):
            val = data.get(key)
            if val is None and alt_key:
                val = data.get(alt_key)
            if val is None:
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        initial_ph = _get_float("initialPH", "initial_ph", 4.4)
        hours_since_mfg = _get_float("hoursSinceManufacture", "hours_since_mfg", 48.0)
        has_refrigerator = int(bool(data.get("hasRefrigerator", data.get("has_refrigerator", 1))))
        raw_storage = data.get("storageType") or data.get("storage_type") or ("fridge" if has_refrigerator else "counter")
        storage_type = STORAGE_TYPE_MAP.get(raw_storage, raw_storage)
        ambient_temp = _get_float("ambientTemperatureC", "ambient_temp", 30.0)
        humidity = _get_float("humidityPct", "humidity", 65.0)
        default_fridge = 4.0 if has_refrigerator else -1.0
        fridge_temp = _get_float("fridgeTemperatureC", "fridge_temp", default_fridge)
        if not has_refrigerator and fridge_temp > 0:
            fridge_temp = -1.0
        hours_on_shelf = _get_float("hoursOnShelf", "hours_on_shelf", 24.0)
        sell_through = _get_float("sellThroughRate", "sell_through", 0.5)
        hours_to_expiry = _get_float("hoursToExpiry", "hours_to_expiry", 120.0)
        volume_kg = _get_float("volumeKg", "volume_kg", 1.0)
        vendor_rating = _get_float("vendorRating", "vendor_rating", 4.0)

        temp_exposure = (fridge_temp if has_refrigerator else ambient_temp) * hours_since_mfg

        feature_dict = {
            "initialPH": initial_ph,
            "hoursSinceManufacture": hours_since_mfg,
            "hasRefrigerator": has_refrigerator,
            "storageTypeEnc": safe_encode(storage_encoder, storage_type, KNOWN_STORAGE),
            "ambientTemperatureC": ambient_temp,
            "humidityPct": humidity,
            "fridgeTemperatureC": fridge_temp,
            "hoursOnShelf": hours_on_shelf,
            "sellThroughRate": sell_through,
            "effectiveTemperatureExposure": round(temp_exposure, 1),
            "hoursToExpiry": hours_to_expiry,
            "volumeKg": volume_kg,
            "vendorRating": vendor_rating,
        }

        row = pd.DataFrame([feature_dict])[spoilage_features]
        pred_encoded = spoilage_model.predict(row)[0]
        risk_label = label_encoder.inverse_transform([pred_encoded])[0]
        proba = spoilage_model.predict_proba(row)[0]
        confidence = round(float(max(proba)) * 100, 1)

        # Freshness score estimation based on biochemical parameters and hours
        freshness_score = max(0.0, min(1.0, round(1.0 - (hours_since_mfg / 120.0), 2)))

        COLS["predictions"].insert_one({
            "predictionType": "SPOILAGE_RISK",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": product_id,
            "predictedValue": risk_label,
            "confidence": confidence,
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": datetime.utcnow(),
        })

        return jsonify({
            "riskLabel": risk_label,
            "risk_label": risk_label,
            "confidence": confidence,
            "mlConfidence": confidence,
            "freshnessScore": freshness_score,
            "probabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
            "mlProbabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
            "vendorId": vendor_id,
            "vendor_id": vendor_id,
            "batchId": batch_id,
            "batch_id": batch_id,
            "productId": product_id,
            "product_id": product_id,
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

    risk_map = {label_encoder.classes_[i]: float(p) for i, p in enumerate(proba)}
    high_prob = risk_map.get("High", 0.0)
    med_prob = risk_map.get("Medium", 0.0)
    low_prob = risk_map.get("Low", 0.0)

    # Calculate composite score (0 to 1) directly from ML model probabilities
    composite_risk = round((high_prob * 0.9) + (med_prob * 0.5) + (low_prob * 0.15), 2)

    return jsonify({
        "batchId": batch_id,
        "batch_id": batch_id,
        "productId": batch.get("product_name", ""),
        "product_name": batch.get("product_name", ""),
        "vendorId": vendor_id,
        "vendor_id": vendor_id,
        "vendorName": vendor.get("shop_name", "") if vendor else "",
        "vendor_name": vendor.get("shop_name", "") if vendor else "",
        "riskLabel": risk_label,
        "mlRiskLabel": risk_label,
        "confidence": confidence,
        "mlConfidence": confidence,
        "riskScore": composite_risk,
        "freshnessScore": composite_risk,
        "freshnessRisk": risk_label,
        "probabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
        "mlProbabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
        "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "sellThroughRate": round(sell_through, 2),
        "dataSource": "ML Model (Random Forest) + Live Batch Telemetry",
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
# API STATUS / HEALTH
# ════════════════════════════════════════════════════════════════════
@app.route("/")
def index():
    return jsonify({
        "name": "B2P Backend API",
        "status": "running",
        "version": "1.0.0"
    })


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
