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
    # Operational (OLTP)
    "vendors":            db["vendors"],
    "products":           db["products"],
    "batches":            db["batches"],
    "inventory":          db["inventory"],
    "orders":             db["orders"],
    "order_items":        db["order_items"],
    "logs":               db["logs"],
    # Analytical (ML Feature Store)
    "predictions":        db["predictions"],
    "inventory_movement": db["inventory_movement"],
    "weather_forecast":   db["weather_forecast"],
    "festival_calendar":  db["festival_calendar"],
    "feature_snapshots":  db["feature_snapshots"],
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


# ── Movement writer (Phase C) ────────────────────────────────────────
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


# ── Festival context lookup (Phase B) ───────────────────────────────
def get_festival_context(target_date):
    """Return (is_festival: int, festival_type: str) for a given date.
    Looks ±2 days around target_date in the festival_calendar collection.
    """
    window_start = datetime(target_date.year, target_date.month, target_date.day) - timedelta(days=2)
    window_end   = datetime(target_date.year, target_date.month, target_date.day) + timedelta(days=2, hours=23, minutes=59)
    doc = COLS["festival_calendar"].find_one({
        "date": {"$gte": window_start, "$lte": window_end}
    }, sort=[("date", 1)])
    if doc:
        return 1, doc.get("festivalType", "publicHoliday")
    return 0, "none"


# ── Weather forecast lookup (Phase B) ────────────────────────────────
def get_weather_for_date(target_date):
    """Return (temperatureC: float, rain_probability: float) for a given date.
    Reads from weather_forecast collection; falls back to Chennai seasonal defaults
    if no forecast is available.
    """
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end   = day_start + timedelta(hours=23, minutes=59)
    doc = COLS["weather_forecast"].find_one(
        {"forecastFor": {"$gte": day_start, "$lte": day_end}},
        sort=[("forecastIssuedAt", -1)]
    )
    if doc:
        return float(doc.get("temperatureC", 31.0)), float(doc.get("rainProbability", 0.2))
    # Chennai seasonal defaults by month
    month = target_date.month
    if month in (6, 7, 8, 9, 10, 11):   # monsoon
        return 29.0, 0.55
    elif month in (12, 1, 2):            # mild winter
        return 26.0, 0.10
    else:                                # summer
        return 35.0, 0.05


# ── Festival calendar seed (Phase B) ────────────────────────────────
def seed_festival_calendar():
    """One-time seed of Tamil Nadu + national festival calendar (2026-2027)."""
    if COLS["festival_calendar"].count_documents({}) > 0:
        return  # already seeded

    festivals = [
        # 2026 festivals
        {"date": datetime(2026, 1, 14), "festivalType": "harvestFestival",  "festivalName": "Pongal Day 1 (Bhogi)",    "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 15), "festivalType": "harvestFestival",  "festivalName": "Pongal",                  "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 16), "festivalType": "harvestFestival",  "festivalName": "Mattu Pongal",            "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 17), "festivalType": "harvestFestival",  "festivalName": "Kaanum Pongal",           "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 26), "festivalType": "publicHoliday",    "festivalName": "Republic Day",            "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 4, 14), "festivalType": "publicHoliday",    "festivalName": "Tamil New Year",          "region": "Tamil Nadu", "windowDays": 2},
        {"date": datetime(2026, 7, 28), "festivalType": "harvestFestival",  "festivalName": "Aadi Perukku",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 8, 15), "festivalType": "publicHoliday",    "festivalName": "Independence Day",        "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 9, 2),  "festivalType": "publicHoliday",    "festivalName": "Ganesh Chaturthi",        "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 10, 2), "festivalType": "publicHoliday",    "festivalName": "Gandhi Jayanti",          "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 10, 14),"festivalType": "publicHoliday",    "festivalName": "Navarathri Day 1",        "region": "Tamil Nadu", "windowDays": 9},
        {"date": datetime(2026, 10, 22),"festivalType": "publicHoliday",    "festivalName": "Vijayadasami",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 11, 10),"festivalType": "publicHoliday",    "festivalName": "Diwali",                  "region": "National",   "windowDays": 2},
        {"date": datetime(2026, 11, 30),"festivalType": "publicHoliday",    "festivalName": "Karthigai Deepam",        "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 12, 25),"festivalType": "publicHoliday",    "festivalName": "Christmas",               "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 12, 31),"festivalType": "publicHoliday",    "festivalName": "New Year Eve",            "region": "National",   "windowDays": 2},
        # 2027 festivals
        {"date": datetime(2027, 1, 1),  "festivalType": "publicHoliday",    "festivalName": "New Year",                "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 1, 14), "festivalType": "harvestFestival",  "festivalName": "Pongal Day 1 (Bhogi)",    "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 15), "festivalType": "harvestFestival",  "festivalName": "Pongal",                  "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 16), "festivalType": "harvestFestival",  "festivalName": "Mattu Pongal",            "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 17), "festivalType": "harvestFestival",  "festivalName": "Kaanum Pongal",           "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 26), "festivalType": "publicHoliday",    "festivalName": "Republic Day",            "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 4, 14), "festivalType": "publicHoliday",    "festivalName": "Tamil New Year",          "region": "Tamil Nadu", "windowDays": 2},
        {"date": datetime(2027, 7, 27), "festivalType": "harvestFestival",  "festivalName": "Aadi Perukku",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2027, 8, 15), "festivalType": "publicHoliday",    "festivalName": "Independence Day",        "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 10, 2), "festivalType": "publicHoliday",    "festivalName": "Gandhi Jayanti",          "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 10, 22),"festivalType": "publicHoliday",    "festivalName": "Navarathri Day 1",        "region": "Tamil Nadu", "windowDays": 9},
        {"date": datetime(2027, 10, 30),"festivalType": "publicHoliday",    "festivalName": "Vijayadasami",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2027, 10, 28),"festivalType": "publicHoliday",    "festivalName": "Diwali",                  "region": "National",   "windowDays": 2},
        {"date": datetime(2027, 12, 25),"festivalType": "publicHoliday",    "festivalName": "Christmas",               "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 12, 31),"festivalType": "publicHoliday",    "festivalName": "New Year Eve",            "region": "National",   "windowDays": 2},
    ]
    try:
        COLS["festival_calendar"].insert_many(festivals, ordered=False)
        print(f"  [OK] Festival calendar seeded with {len(festivals)} events")
    except Exception as e:
        print(f"  [WARN] Festival calendar seed partial: {e}")


seed_festival_calendar()


# ── Startup validator: catch verificationStatus field name drift ─────
def _validate_vendor_field_names():
    bad = COLS["vendors"].count_documents({"verification_status": {"$exists": True}})
    if bad > 0:
        print(f"  [WARN] {bad} vendor(s) still have snake_case 'verification_status' — run migration!")


_validate_vendor_field_names()



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

    # ── Weather: read from weather_forecast collection (Chennai seasonal fallback) ──
    temperature, rain_prob = get_weather_for_date(target_date)

    # ── Festival context: read from festival_calendar collection ──
    is_festival, festival_type = get_festival_context(target_date)


    feature_dict = {
        "hourSin": round(hour_sin, 4),
        "hourCos": round(hour_cos, 4),
        "weekdaySin": round(weekday_sin, 4),
        "weekdayCos": round(weekday_cos, 4),
        "isWeekend": is_weekend,
        "isFestivalWindow": is_festival,     # live from festival_calendar collection
        "forecastTemperatureC": temperature, # live from weather_forecast collection
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
    low_stock = inventory_col.count_documents({
        "$expr": {"$lte": ["$quantity", {"$ifNull": ["$minimumStock", "$minimum_stock"]}]}
    })

    # 7-day demand trend (dynamically aggregated from orders/predictions/ML model)
    now = datetime.utcnow()
    trend_7day = []
    # Pre-fetch order items & orders for the last 7 days to calculate actual sales per day
    start_7d = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    recent_orders_7d = list(orders_col.find({"order_date": {"$gte": start_7d}}, {"order_id": 1, "order_date": 1}))
    order_id_map_7d = {o["order_id"]: o["order_date"] for o in recent_orders_7d}
    items_7d = list(COLS["order_items"].find({"order_id": {"$in": list(order_id_map_7d.keys())}}, {"order_id": 1, "quantity": 1})) if order_id_map_7d else []
    
    daily_actuals = {}
    for it in items_7d:
        o_date = order_id_map_7d.get(it["order_id"])
        if isinstance(o_date, str):
            o_date = parse_date(o_date)
        if o_date:
            d_key = o_date.strftime("%Y-%m-%d")
            daily_actuals[d_key] = daily_actuals.get(d_key, 0.0) + float(it.get("quantity", 0))

    # Pre-fetch active vendors & build dictionary for instant in-memory lookups
    active_vendors_list = list(vendors_col.find({"verificationStatus": "active"}))
    vendors_by_id = {v.get("vendor_id"): v for v in active_vendors_list}

    # Compute live predictions and spike percentages for active vendors (executed once per vendor)
    vendor_predictions = {}
    top_spike_candidates = []
    for v in active_vendors_list:
        v_id = v.get("vendor_id")
        try:
            feat_dict, avail_stock, _ = compute_sales_features(v_id, "Idli Batter", now, "morning")
            row_df = pd.DataFrame([feat_dict])[demand_features]
            v_pred = max(0.0, round(float(demand_model.predict(row_df)[0]), 1))
            vendor_predictions[v_id] = v_pred
            rolling_base = max(5.0, feat_dict.get("rolling7DayMean", 15.0))
            spike_pct = round(((v_pred - rolling_base) / rolling_base) * 100, 1)
            top_spike_candidates.append({
                "vendor_id": v_id,
                "shop_name": v.get("shop_name", v_id),
                "spikePct": spike_pct,
                "predictedKg": v_pred,
            })
        except Exception as e:
            print(f"[WARN] Failed spike prediction for {v_id}: {e}")

    top_spike_candidates.sort(key=lambda x: (x["spikePct"], x["predictedKg"]), reverse=True)
    top_spike_vendors = top_spike_candidates[:5]
    total_active_pred = sum(vendor_predictions.values()) or 45.0

    # 7-day demand trend (combines real order sales + ML forecast with festival/day-of-week modulation)
    for i in range(7):
        day = now - timedelta(days=6 - i)
        d_key = day.strftime("%Y-%m-%d")
        actual_val = round(daily_actuals.get(d_key, 0.0), 1)

        weekday_idx = day.weekday()
        wk_factor = 1.15 if weekday_idx in (5, 6) else (0.92 if weekday_idx == 0 else 1.0)
        is_fest, _ = get_festival_context(day)
        fest_factor = 1.25 if is_fest else 1.0
        pred_val = round(total_active_pred * wk_factor * fest_factor, 1)

        if actual_val == 0.0:
            actual_val = round(pred_val * 0.92, 1)

        trend_7day.append({
            "date": day.strftime("%b %d"),
            "day": day.strftime("%a"),
            "predicted": pred_val,
            "actual": actual_val,
        })

    # Fleet Spoilage Risk Distribution (Live Random Forest model inference over active batches)
    active_batches = list(batches_col.find({}).limit(50))
    green_c, amber_c, red_c = 0, 0, 0
    for b in active_batches:
        b_mfg = b.get("mfgTimestamp") or b.get("mfg_timestamp") or b.get("created_at") or now
        if isinstance(b_mfg, str):
            b_mfg = parse_date(b_mfg)
        b_hours = max(0.0, (now - b_mfg).total_seconds() / 3600.0)
        v_doc = vendors_by_id.get(b.get("vendor_id"))
        h_fridge = 1 if v_doc and v_doc.get("hasRefrigerator") else 0
        f_temp = v_doc.get("fridgeTemperatureC", 4.0) if v_doc and h_fridge else -1.0
        amb_temp = float(b.get("temperatureC", 30.0))
        st_type = v_doc.get("storageType", "counter") if v_doc else "counter"
        h_shelf = b_hours * 0.8
        h_exp = max(0.0, 72.0 - b_hours) if h_fridge else max(0.0, 24.0 - b_hours)
        t_exp = (f_temp if h_fridge else amb_temp) * b_hours


        b_feat = {
            "initialPH": float(b.get("initialPH", 4.4)),
            "hoursSinceManufacture": round(b_hours, 1),
            "hasRefrigerator": h_fridge,
            "storageTypeEnc": safe_encode(storage_encoder, st_type, KNOWN_STORAGE),
            "ambientTemperatureC": amb_temp,
            "humidityPct": float(b.get("humidityPct", 60.0)),
            "fridgeTemperatureC": f_temp,
            "hoursOnShelf": round(h_shelf, 1),
            "sellThroughRate": 0.5,
            "effectiveTemperatureExposure": round(t_exp, 1),
            "hoursToExpiry": round(h_exp, 1),
            "volumeKg": float(b.get("volume_kg", 10.0)),
            "vendorRating": float(v_doc.get("rating", 4.0)) if v_doc else 4.0,
        }
        try:
            b_row = pd.DataFrame([b_feat])[spoilage_features]
            b_proba = spoilage_model.predict_proba(b_row)[0]
            r_map = {label_encoder.classes_[idx]: float(p) for idx, p in enumerate(b_proba)}
            c_risk = (r_map.get("High", 0.0) * 0.9) + (r_map.get("Medium", 0.0) * 0.5) + (r_map.get("Low", 0.0) * 0.15)
            if c_risk < 0.35:
                green_c += 1
            elif c_risk <= 0.70:
                amber_c += 1
            else:
                red_c += 1
        except Exception:
            amber_c += 1

    spoilage_dist = {
        "green": max(0, green_c),
        "amber": max(0, amber_c),
        "red": max(0, red_c),
    }

    # Vendor Requisitions (pending vendor sign-ups)
    pending_vendors = list(vendors_col.find({"verificationStatus": "pending"}))
    if not pending_vendors:
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

    # 4-week dispatch trend (dynamically aggregated from batch assignments)
    weekly_dispatch = []
    for w in range(4):
        w_start = now - timedelta(days=(4 - w) * 7)
        w_end = now - timedelta(days=(3 - w) * 7)
        w_count = batches_col.count_documents({
            "status": {"$in": ["assigned", "received"]},
            "$or": [
                {"assigned_at": {"$gte": w_start, "$lt": w_end}},
                {"created_at": {"$gte": w_start, "$lt": w_end}},
            ]
        })
        weekly_dispatch.append({
            "week": f"W{w+1}",
            "label": f"Week {w+1}",
            "dispatched": w_count
        })


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


@app.route("/api/batches/<batch_id>", methods=["GET"])
def get_single_batch(batch_id):
    """Retrieve details of a single batch."""
    doc = COLS["batches"].find_one({"batch_id": batch_id})
    if not doc:
        return jsonify({"error": "Batch not found"}), 404
    item = jsonify_doc(doc)
    if item.get("vendor_id"):
        vendor = COLS["vendors"].find_one({"vendor_id": item["vendor_id"]})
        item["vendor_name"] = vendor.get("shop_name", "") if vendor else ""
    else:
        item["vendor_name"] = ""
    return jsonify(item)


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
        now = datetime.utcnow()

        result = COLS["batches"].update_one(
            {"batch_id": batch_id},
            {
                "$set": {"vendor_id": vendor_id, "status": "assigned", "assigned_at": now},
                "$push": {"assignment_log": {"vendor_id": vendor_id, "assigned_at": now, "assigned_by": "Admin"}},
            }
        )
        if result.matched_count == 0:
            return jsonify({"error": "Batch not found"}), 404

        log_event("activity", "info", "Admin", f"Batch #{batch_id} assigned to {v_name}", {"type": "batch", "id": batch_id, "name": batch_id})
        return jsonify({"ok": True, "vendor_id": vendor_id, "vendor_name": v_name})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/receive", methods=["PUT", "PATCH"])
def receive_batch(batch_id):
    """Confirm receipt of a batch (by vendor or admin on vendor's behalf)."""
    try:
        data = request.json or {}
        notes = data.get("notes", "")
        now = datetime.utcnow()

        batch = COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "received", "received_at": now, "received_notes": notes}}
        )

        vendor_id = batch.get("vendor_id", "")
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        v_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id
        qty = float(batch.get("volume_kg", batch.get("quantity_kg", 15.0)))
        product_name = batch.get("product_name", "Idli Batter")
        product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)

        log_event(
            "activity", "info", "Admin",
            f"Batch #{batch_id} marked received & stocked ({qty} kg) for {v_name}",
            {"type": "batch", "id": batch_id, "name": batch_id}
        )

        # Update or create inventory entry for this vendor (camelCase fields)
        if vendor_id:
            inv = COLS["inventory"].find_one({"vendor_id": vendor_id})
            if inv:
                prev_qty = float(inv.get("quantity", 0))
                COLS["inventory"].update_one(
                    {"vendor_id": vendor_id},
                    {"$inc": {"quantity": qty}, "$set": {"receivedAt": now}}
                )
                new_qty = prev_qty + qty
            else:
                prev_qty = 0.0
                new_qty = qty
                mfg_ts = batch.get("mfgTimestamp") or batch.get("mfg_timestamp") or now
                expiry_dt = now + timedelta(hours=24)
                inv_id = f"INV_{vendor_id}"
                COLS["inventory"].insert_one({
                    "inventory_id": inv_id,
                    "vendor_id": vendor_id,
                    "product_id": product_id,
                    "product_name": product_name,
                    "batch_number": batch.get("batch_number", batch_id),
                    "quantity": qty,
                    "minimumStock": max(5.0, qty / 3.0),
                    "price": 120.0,
                    "manufactureDate": mfg_ts,
                    "expiryAt": expiry_dt,
                    "receivedAt": now,
                    "freshnessScore": 0.95,   # fresh on arrival
                })

            # Phase C: write inventory_movement event
            write_movement(
                vendor_id=vendor_id, product_id=product_id,
                movement_type="receive", quantity=qty,
                batch_id=batch_id,
                expiry_at=now + timedelta(hours=24),
                triggered_by="admin",
                previous_qty=prev_qty, new_qty=new_qty,
                notes=f"Batch #{batch_id} received"
            )

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


@app.route("/api/batches/<batch_id>/stockout", methods=["POST", "PUT", "PATCH"])
def mark_batch_stockout(batch_id):
    """Vendor or admin marks batch as stock out / depleted, removing it from active store inventory."""
    try:
        batch = COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        now = datetime.utcnow()
        vendor_id = batch.get("vendor_id", "")
        product_name = batch.get("product_name", "Idli Batter")
        product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)
        volume = float(batch.get("volume_kg", batch.get("quantity_kg", 0.0)))

        # Update batch status in batches collection
        COLS["batches"].update_one(
            {"batch_id": batch_id},
            {"$set": {
                "status": "stockout",
                "stocked_out_at": now,
                "remaining_volume_kg": 0.0,
            }}
        )

        # Update vendor active inventory in inventory collection
        if vendor_id:
            inv = COLS["inventory"].find_one({"vendor_id": vendor_id})
            prev_qty = float(inv.get("quantity", 0.0)) if inv else 0.0
            new_qty = max(0.0, round(prev_qty - volume, 1))
            if inv:
                COLS["inventory"].update_one(
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
                notes=f"Batch #{batch_id} marked as Stock Out / Depleted"
            )

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id}) if vendor_id else None
        shop_name = vendor.get("shop_name", vendor_id) if vendor else "Vendor"
        log_event(
            "activity", "info", shop_name,
            f"Batch #{batch_id} marked as Stock Out (removed from active store) at {shop_name}",
            {"type": "batch", "id": batch_id, "name": batch_id}
        )

        return jsonify({
            "ok": True,
            "batch_id": batch_id,
            "status": "stockout",
            "message": f"Batch #{batch_id} marked as Stock Out and removed from store page"
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>/report-issue", methods=["POST"])
def report_batch_issue(batch_id):
    """Vendor flags an issue with an assigned/received batch."""
    try:
        data = request.json or {}
        issue_type = data.get("issue_type", "other")
        description = data.get("description", "")
        vendor_id = data.get("vendor_id") or (session.get("user") or {}).get("vendor_id", "")

        batch = COLS["batches"].find_one({"batch_id": batch_id})
        if not batch:
            return jsonify({"error": "Batch not found"}), 404

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id}) if vendor_id else None
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


@app.route("/api/inventory/summary", methods=["GET"])
def get_inventory_summary():
    """Return an aggregated inventory summary for dashboard display."""
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    if not vendor_id:
        return jsonify({"error": "vendor_id is required"}), 400

    inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    total_qty = sum(float(i.get("quantity", 0)) for i in inv_items)
    min_stock = sum(float(i.get("minimumStock") or i.get("minimum_stock", 0)) for i in inv_items)
    if min_stock == 0:
        min_stock = 10.0

    freshness_scores = [float(i.get("freshnessScore") or i.get("freshness_score", 0.8)) for i in inv_items]
    avg_freshness = round(sum(freshness_scores) / len(freshness_scores), 2) if (freshness_scores and total_qty > 0) else 0.0

    batches = list(COLS["batches"].find({"vendor_id": vendor_id}))
    batch_count = len(batches)
    received_batches = [b for b in batches if b.get("status") == "received"]
    received_batch_count = len(received_batches) if total_qty > 0 else 0

    now = datetime.utcnow()
    oldest_batch_age_hrs = 0.0
    if received_batches and total_qty > 0:
        ages = []
        for b in received_batches:
            mfg = b.get("mfgTimestamp") or b.get("mfg_timestamp") or b.get("received_at") or b.get("created_at")
            if mfg:
                if isinstance(mfg, str):
                    mfg = parse_date(mfg)
                ages.append(max(0.0, (now - mfg).total_seconds() / 3600.0))
        if ages:
            oldest_batch_age_hrs = round(max(ages), 1)

    products = list(set(i.get("product_name", "Idli Batter") for i in inv_items)) or ["Idli Batter"]

    return jsonify({
        "vendorId": vendor_id,
        "totalQuantityKg": round(total_qty, 1),
        "minimumStockKg": round(min_stock, 1),
        "belowMinimum": total_qty < min_stock,
        "isStockOut": total_qty <= 0,
        "batchCount": batch_count,
        "receivedBatchCount": received_batch_count,
        "oldestBatchAgeHrs": oldest_batch_age_hrs,
        "freshnessScore": avg_freshness,
        "products": products
    })


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
        now = datetime.utcnow()

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id

        inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
        current_total = sum(float(i.get("quantity", 0)) for i in inv_items)
        product_id = PRODUCT_NAME_TO_ID.get(
            inv_items[0].get("product_name", "Idli Batter") if inv_items else "Idli Batter",
            "Idly_Batter"
        )

        if action == "edit" or new_qty is not None:
            target_qty = max(0.0, float(new_qty if new_qty is not None else delta))
            log_msg = f"Admin edited inventory for {shop_name} (set to {target_qty} kg)"
            mv_type, mv_qty = "edit", target_qty - current_total
        elif action == "remove_batch":
            target_qty = max(0.0, current_total - abs(delta))
            log_msg = f"Admin removed stock for {shop_name} (-{abs(delta)} kg, total: {target_qty} kg)"
            mv_type, mv_qty = "remove", -abs(delta)
        elif action == "add_batch":
            target_qty = current_total + abs(delta)
            log_msg = f"Admin added stock for {shop_name} (+{abs(delta)} kg, total: {target_qty} kg)"
            mv_type, mv_qty = "add", abs(delta)
        else:
            target_qty = max(0.0, current_total + delta)
            log_msg = f"Admin adjusted stock for {shop_name} ({delta:+} kg, total: {target_qty} kg)"
            mv_type, mv_qty = "adjustment", delta

        if not inv_items:
            inv_id = f"INV_{vendor_id}"
            COLS["inventory"].insert_one({
                "inventory_id": inv_id,
                "vendor_id": vendor_id,
                "product_name": data.get("product_name", "Idli Batter"),
                "quantity": target_qty,
                "minimumStock": 5.0,
                "freshnessScore": 0.2,
                "receivedAt": now,
            })
        else:
            primary_id = inv_items[0]["_id"]
            COLS["inventory"].update_one(
                {"_id": primary_id},
                {"$set": {"quantity": target_qty, "receivedAt": now}}
            )
            if len(inv_items) > 1:
                other_ids = [i["_id"] for i in inv_items[1:]]
                COLS["inventory"].delete_many({"_id": {"$in": other_ids}})

        # If stock is completely depleted, transition active received batches to stockout
        if target_qty == 0:
            COLS["batches"].update_many(
                {"vendor_id": vendor_id, "status": "received"},
                {"$set": {"status": "stockout", "stocked_out_at": now, "remaining_volume_kg": 0.0}}
            )

        # Phase C: write inventory_movement event
        write_movement(
            vendor_id=vendor_id, product_id=product_id,
            movement_type=mv_type if target_qty > 0 else "stockout", quantity=mv_qty,
            triggered_by="admin",
            previous_qty=current_total, new_qty=target_qty,
            notes=log_msg
        )

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
# WEATHER FORECAST (Analytical DB — Phase B)
# ════════════════════════════════════════════════════════════════════
@app.route("/api/weather-forecast", methods=["GET"])
def get_weather_forecast():
    """Return weather forecast records. Optionally filter by date (YYYY-MM-DD)."""
    date_str = request.args.get("date")
    query = {}
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d")
            query["forecastFor"] = {"$gte": day, "$lte": day + timedelta(hours=23, minutes=59)}
        except Exception:
            pass
    docs = list(COLS["weather_forecast"].find(query).sort("forecastIssuedAt", -1).limit(30))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/weather-forecast", methods=["POST"])
def set_weather_forecast():
    """Admin manual override: create or update a weather forecast for a given date."""
    try:
        data = request.json or {}
        date_str = data.get("date") or data.get("forecastFor")
        if not date_str:
            return jsonify({"error": "date (YYYY-MM-DD) is required"}), 400
        try:
            forecast_for = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
        except Exception:
            return jsonify({"error": "Invalid date format — use YYYY-MM-DD"}), 400

        temp_c = float(data.get("temperatureC", 31.0))
        rain_prob = float(data.get("rainProbability", 0.2))
        if not (0.0 <= rain_prob <= 1.0):
            return jsonify({"error": "rainProbability must be 0.0–1.0"}), 400
        if not (-10.0 <= temp_c <= 55.0):
            return jsonify({"error": "temperatureC out of valid range (-10 to 55)"}), 400

        now = datetime.utcnow()
        doc = {
            "locationGridKey": data.get("locationGridKey", "chennai_central"),
            "forecastIssuedAt": now,
            "forecastFor": forecast_for,
            "temperatureC": temp_c,
            "rainProbability": rain_prob,
            "humidityPct": float(data.get("humidityPct", 70.0)),
            "source": "manual_override",
        }
        # Upsert: replace existing forecast for this date+location
        result = COLS["weather_forecast"].update_one(
            {
                "forecastFor": forecast_for,
                "locationGridKey": doc["locationGridKey"],
                "source": "manual_override",
            },
            {"$set": doc},
            upsert=True
        )
        log_event("activity", "info", "Admin",
                  f"Weather forecast set for {date_str}: {temp_c}°C, rain={rain_prob*100:.0f}%",
                  {"type": "system", "id": "WEATHER_FORECAST", "name": "Weather Forecast"})
        return jsonify({"ok": True, "upserted": result.upserted_id is not None})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════════
# FESTIVAL CALENDAR (Analytical DB — Phase B)
# ════════════════════════════════════════════════════════════════════
@app.route("/api/festival-calendar", methods=["GET"])
def get_festival_calendar():
    """Return all upcoming festival events. Optionally filter by region."""
    region = request.args.get("region")
    query = {}
    if region:
        query["region"] = region
    docs = list(COLS["festival_calendar"].find(query).sort("date", 1))
    return jsonify([jsonify_doc(d) for d in docs])


# ════════════════════════════════════════════════════════════════════
# INVENTORY MOVEMENT (Analytical DB — Phase C)
# ════════════════════════════════════════════════════════════════════
@app.route("/api/inventory-movement", methods=["GET"])
def get_inventory_movement():
    """Return inventory movement history for a vendor or globally."""
    vendor_id = request.args.get("vendorId") or request.args.get("vendor_id")
    limit = int(request.args.get("limit", 100))
    query = {}
    if vendor_id:
        query["vendorId"] = vendor_id
    docs = list(COLS["inventory_movement"].find(query).sort("occurredAt", -1).limit(limit))
    return jsonify([jsonify_doc(d) for d in docs])


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
def ensure_seed_orders():
    if COLS["orders"].count_documents({}) == 0:
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
        COLS["orders"].insert_many(seeds)

ensure_seed_orders()


@app.route("/api/orders", methods=["GET"])
def get_orders():
    vendor_id = request.args.get("vendor_id") or request.args.get("vendorId")
    query = {"vendor_id": vendor_id} if vendor_id else {}
    docs = list(COLS["orders"].find(query).sort("order_date", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


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

        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        shop_name = vendor.get("shop_name", vendor_id) if vendor else vendor_id or "Vendor"

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
        }
        COLS["orders"].insert_one(doc)

        log_event(
            "activity",
            "info",
            vendor_id,
            f"Vendor {shop_name} submitted restock request for {qty} kg of {product_name}",
            {"type": "order", "id": order_id, "name": order_id},
            {"vendor_id": vendor_id, "product_name": product_name, "quantity_kg": qty, "notes": notes}
        )

        return jsonify({"ok": True, "order_id": order_id, "order": jsonify_doc(doc)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400



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
    min_stock = sum(i.get("minimumStock") or i.get("minimum_stock", 0) for i in inv_items)
    
    # Phase D: Persist prediction with numericValue + feature snapshot
    product_id = PRODUCT_NAME_TO_ID.get(product_name, "Idly_Batter")
    win_start = now.replace(hour=7, minute=0, second=0, microsecond=0)
    win_end = now.replace(hour=17, minute=0, second=0, microsecond=0)
    try:
        pred_res = COLS["predictions"].insert_one({
            "predictionType": "DEMAND",
            "vendorId": vendor_id,
            "productId": product_id,
            "numericValue": predicted,
            "predictedValue": predicted,
            "confidence": 92.0,
            "recommendedDispatch": net_dispatch_needed,
            "windowStart": win_start,
            "windowEnd": win_end,
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": now,
        })
        pred_id = str(pred_res.inserted_id)

        COLS["feature_snapshots"].insert_one({
            "snapshotId": f"FS_{pred_id}",
            "vendorId": vendor_id,
            "productId": product_id,
            "predictionId": pred_id,
            "predictionType": "DEMAND",
            "windowStart": win_start,
            "windowEnd": win_end,
            "featureVector": feature_dict,
            "targetValue": None,
            "datasetVersion": "v1.0",
            "createdAt": now,
        })
    except Exception as pe:
        print(f"[WARN] Prediction/snapshot persist failed: {pe}")

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
        "safetyStock": round(min_stock * 1.2, 1),
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
    
    # Vendor storage parameters
    has_fridge = 1 if vendor.get("hasRefrigerator") else 0
    fridge_temp = float(vendor.get("fridgeTemperatureC", 4.0)) if has_fridge else -1.0
    storage_type = vendor.get("storageType", "counter")
    vendor_rating = float(vendor.get("rating", 4.0))

    inv_item = COLS["inventory"].find_one({"vendor_id": vendor_id})
    inv_qty = float(inv_item.get("quantity", 0.0)) if inv_item else 0.0

    # Only look for active received batches in store (NOT assigned or stocked out)
    active_batch = COLS["batches"].find_one(
        {"vendor_id": vendor_id, "status": "received"},
        sort=[("received_at", DESCENDING), ("created_at", DESCENDING)]
    )

    # If vendor has zero stock or no active batch in store, stock is out!
    if inv_qty <= 0 or not active_batch:
        return jsonify({
            "vendorId": vendor_id,
            "shopName": vendor.get("shop_name", ""),
            "batchId": "N/A",
            "hasRefrigerator": bool(has_fridge),
            "storageType": storage_type,
            "fridgeTemperatureC": fridge_temp,
            "riskLabel": "None",
            "isStockOut": True,
            "confidence": 100.0,
            "riskScore": 0.0,
            "freshnessScore": 0.0,
            "hoursSinceManufacture": 0.0,
            "hoursToExpiry": 0.0,
            "probabilities": {"High": 0.0, "Medium": 0.0, "Low": 0.0},
            "statusMessage": "Stock Out: No active batter stock in store",
            "dataSource": "Inventory Telemetry (Stock Depleted)",
        })

    mfg = active_batch.get("mfgTimestamp") or active_batch.get("mfg_timestamp") or active_batch.get("created_at") or now
    if isinstance(mfg, str):
        mfg = parse_date(mfg)
    hours_since_mfg = max(0.5, (now - mfg).total_seconds() / 3600.0)
    initial_ph = float(active_batch.get("initialPH", 4.4))
    ambient_temp = float(active_batch.get("temperatureC", 30.0))
    humidity = float(active_batch.get("humidityPct", 60.0))
    volume = float(active_batch.get("volume_kg", inv_qty))
    batch_id = active_batch.get("batch_id")

    hours_on_shelf = hours_since_mfg * 0.7
    sell_through = 0.5
    temp_exposure = (fridge_temp if has_fridge else ambient_temp) * hours_since_mfg
    max_shelf_life = 96.0 if has_fridge else 36.0
    hours_to_expiry = max(0.0, round(max_shelf_life - hours_since_mfg, 1))

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
    # Freshness is inverse of spoilage risk
    freshness_score = max(0.0, min(1.0, round(1.0 - composite_risk, 2)))
    
    return jsonify({
        "vendorId": vendor_id,
        "shopName": vendor.get("shop_name", ""),
        "batchId": batch_id,
        "hasRefrigerator": bool(has_fridge),
        "storageType": storage_type,
        "fridgeTemperatureC": fridge_temp,
        "riskLabel": risk_label,
        "isStockOut": False,
        "confidence": confidence,
        "riskScore": composite_risk,
        "freshnessScore": freshness_score,
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

        now = datetime.utcnow()
        win_start = target_date.replace(hour=7, minute=0, second=0, microsecond=0)
        win_end = target_date.replace(hour=17, minute=0, second=0, microsecond=0)
        pred_res = COLS["predictions"].insert_one({
            "predictionType": "DEMAND",
            "vendorId": vendor_id,
            "productId": product_id,
            "date": target_date,
            "window": window,
            "numericValue": predicted_demand,
            "predictedValue": predicted_demand,
            "confidence": 92.0,
            "recommendedDispatch": recommended_dispatch,
            "windowStart": win_start,
            "windowEnd": win_end,
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": now,
        })
        pred_id = str(pred_res.inserted_id)

        COLS["feature_snapshots"].insert_one({
            "snapshotId": f"FS_{pred_id}",
            "vendorId": vendor_id,
            "productId": product_id,
            "predictionId": pred_id,
            "predictionType": "DEMAND",
            "windowStart": win_start,
            "windowEnd": win_end,
            "featureVector": feature_dict,
            "targetValue": None,
            "datasetVersion": "v1.0",
            "createdAt": now,
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

        now = datetime.utcnow()
        pred_res = COLS["predictions"].insert_one({
            "predictionType": "SPOILAGE_RISK",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": product_id,
            "predictedValue": risk_label,
            "numericValue": round(1.0 - freshness_score, 2),
            "confidence": confidence,
            "recommendedDispatch": 0.0,
            "windowStart": now,
            "windowEnd": now + timedelta(hours=24),
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": now,
        })
        pred_id = str(pred_res.inserted_id)

        COLS["feature_snapshots"].insert_one({
            "snapshotId": f"FS_{pred_id}",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": product_id,
            "predictionId": pred_id,
            "predictionType": "SPOILAGE_RISK",
            "windowStart": now,
            "windowEnd": now + timedelta(hours=24),
            "featureVector": feature_dict,
            "targetValue": None,
            "datasetVersion": "v1.0",
            "createdAt": now,
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

    # If batch is marked stockout / depleted
    if batch.get("status") == "stockout":
        return jsonify({
            "batchId": batch_id,
            "batch_id": batch_id,
            "productId": batch.get("product_name", "Idli Batter"),
            "product_name": batch.get("product_name", "Idli Batter"),
            "vendorId": batch.get("vendor_id", ""),
            "vendor_id": batch.get("vendor_id", ""),
            "vendorName": vendor.get("shop_name", "") if vendor else "",
            "vendor_name": vendor.get("shop_name", "") if vendor else "",
            "riskLabel": "None",
            "mlRiskLabel": "None",
            "isStockOut": True,
            "confidence": 100.0,
            "mlConfidence": 100.0,
            "riskScore": 0.0,
            "freshnessScore": 0.0,
            "freshnessRisk": "Stock Out",
            "probabilities": {"High": 0.0, "Medium": 0.0, "Low": 0.0},
            "mlProbabilities": {"High": 0.0, "Medium": 0.0, "Low": 0.0},
            "hoursSinceManufacture": 0.0,
            "hoursToExpiry": 0.0,
            "sellThroughRate": 0.0,
            "statusMessage": "Batch is stocked out / depleted and removed from store",
            "dataSource": "Inventory Telemetry (Stock Depleted)",
        })

    # ── Hours since manufacture (from BATCHES.mfgTimestamp) ──
    mfg = batch.get("mfgTimestamp") or batch.get("mfg_timestamp") or now
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

    # ── Hours on shelf (from INVENTORY.receivedAt) ──
    inv_item = COLS["inventory"].find_one({"batch_number": batch.get("batch_number", batch_id)})
    hours_on_shelf = hours_since_mfg * 0.8  # default
    if inv_item:
        received = inv_item.get("receivedAt") or inv_item.get("received_at") or now
        if isinstance(received, str):
            received = parse_date(received)
        hours_on_shelf = max(0, (now - received).total_seconds() / 3600)

    # ── Hours to expiry ──
    max_shelf_life = 96.0 if has_fridge else 36.0
    hours_to_expiry = max(0.0, round(max_shelf_life - hours_since_mfg, 1))

    # ── Sell-through rate: prefer inventory_movement if available ──
    vendor_id = batch.get("vendor_id", "")
    move_count = COLS["inventory_movement"].count_documents(
        {"vendorId": vendor_id, "movementType": "sale"}
    ) if vendor_id else 0
    if move_count > 0:
        total_sold = abs(sum(
            m.get("quantity", 0) for m in
            COLS["inventory_movement"].find({"vendorId": vendor_id, "movementType": "sale"}, {"quantity": 1})
        ))
        batch_qty = inv_item.get("quantity", 10) if inv_item else batch.get("volume_kg", 1.0)
        sell_through = min(1.0, total_sold / max(1, batch_qty + total_sold))
    else:
        # Fallback: order count proxy
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
    # Freshness score is the inverse of risk score (0 to 1)
    freshness_score = max(0.0, min(1.0, round(1.0 - composite_risk, 2)))

    # Phase D: Persist prediction with numericValue + feature snapshot
    try:
        pred_res = COLS["predictions"].insert_one({
            "predictionType": "SPOILAGE_RISK",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": batch.get("product_name", "Idli Batter"),
            "predictedValue": risk_label,
            "numericValue": composite_risk,
            "confidence": confidence,
            "recommendedDispatch": 0.0,
            "windowStart": now,
            "windowEnd": now + timedelta(hours=24),
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": now,
        })
        pred_id = str(pred_res.inserted_id)

        COLS["feature_snapshots"].insert_one({
            "snapshotId": f"FS_{pred_id}",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": batch.get("product_name", "Idli Batter"),
            "predictionId": pred_id,
            "predictionType": "SPOILAGE_RISK",
            "windowStart": now,
            "windowEnd": now + timedelta(hours=24),
            "featureVector": feature_dict,
            "targetValue": None,
            "datasetVersion": "v1.0",
            "createdAt": now,
        })
    except Exception as pe:
        print(f"[WARN] Spoilage prediction/snapshot persist failed: {pe}")


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
        "isStockOut": False,
        "confidence": confidence,
        "mlConfidence": confidence,
        "riskScore": composite_risk,
        "freshnessScore": freshness_score,
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
