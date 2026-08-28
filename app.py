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

# ── Flask setup ──────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "b2p-secret-key-change-in-production")
CORS(app)

# ── Admin credentials ───────────────────────────────────────────────
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

# ── MongoDB connection ──────────────────────────────────────────────
MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://rioprakash47_db_user:q7ngEz0PZF3L9szJ@cluster0.ziuzjl5.mongodb.net"
)
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
    product_map = {"Idli Batter": "Idly_Batter", "Dosa Batter": "Dosa_Batter",
                   "Combo Pack": "Combo_Pack", "Rava Batter": "Dosa_Batter"}
    product_id = product_map.get(product_name, "Idly_Batter")
    
    # ── Sales History: query ORDER_ITEMS + ORDERS for this vendor ──
    vendor_orders = list(COLS["orders"].find(
        {"vendor_id": vendor_id},
        {"order_id": 1, "order_date": 1, "total_amount": 1}
    ).sort("order_date", -1).limit(100))
    
    # Get order items to compute actual units sold
    order_ids = [o["order_id"] for o in vendor_orders]
    vendor_items = list(COLS["order_items"].find(
        {"order_id": {"$in": order_ids}} if order_ids else {},
        {"order_id": 1, "quantity": 1}
    ))
    
    # Map order_id → total units sold
    order_units = {}
    for item in vendor_items:
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
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated


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
    total_stock = sum(d.get("quantity", 0) for d in inventory.find({}, {"quantity": 1}))
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
    result = []
    for d in docs:
        item = jsonify_doc(d)
        item["batch_count"] = COLS["batches"].count_documents({"vendor_id": d.get("vendor_id")})
        item["received_count"] = COLS["batches"].count_documents({"vendor_id": d.get("vendor_id"), "status": "received"})
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
    result = []
    for d in docs:
        item = jsonify_doc(d)
        # Attach vendor info
        v = COLS["vendors"].find_one({"vendor_id": d.get("vendor_id")})
        if v:
            item["vendor_name"] = v.get("shop_name", "")
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
    result = []
    for d in docs:
        item = jsonify_doc(d)
        v = COLS["vendors"].find_one({"vendor_id": d.get("vendor_id")})
        if v:
            item["vendor_name"] = v.get("shop_name", "")
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
# SEED DATA
# ════════════════════════════════════════════════════════════════════
def seed_data():
    now = datetime.utcnow()

    if COLS["vendors"].count_documents({}) == 0:
        vendors = [
            {"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop", "owner_name": "Lakshmi Devi",
             "phone": "9876543210", "address": "12 Main Road, T Nagar, Chennai",
             "localityTier": "residential_budget", "hotspotDensityScore": 33,
             "hasRefrigerator": True, "storageType": "fridge", "fridgeTemperatureC": 4.9, "rating": 4.5,
             "createdAt": now},
            {"vendor_id": "V101", "shop_name": "Karthik Dosa Center", "owner_name": "Karthik Raj",
             "phone": "9876543211", "address": "45 Anna Salai, Nungambakkam, Chennai",
             "localityTier": "commercial", "hotspotDensityScore": 52,
             "hasRefrigerator": False, "storageType": "backroom", "fridgeTemperatureC": -1, "rating": 3.8,
             "createdAt": now},
            {"vendor_id": "V102", "shop_name": "Fresh Batter Corner", "owner_name": "Priya Sharma",
             "phone": "9876543212", "address": "78 Velachery Main Road, Chennai",
             "localityTier": "residential_premium", "hotspotDensityScore": 41,
             "hasRefrigerator": False, "storageType": "backroom", "fridgeTemperatureC": -1, "rating": 4.2,
             "createdAt": now},
            {"vendor_id": "V103", "shop_name": "Campus Canteen", "owner_name": "Ravi Kumar",
             "phone": "9876543213", "address": "IIT Madras Campus, Adyar, Chennai",
             "localityTier": "institutional", "hotspotDensityScore": 60,
             "hasRefrigerator": True, "storageType": "counter", "fridgeTemperatureC": 6.3, "rating": 4.6,
             "createdAt": now},
            {"vendor_id": "V104", "shop_name": "RK Batter House", "owner_name": "Rajesh Kumar",
             "phone": "9876543214", "address": "23 OMR Road, Sholinganallur, Chennai",
             "localityTier": "residential_budget", "hotspotDensityScore": 25,
             "hasRefrigerator": False, "storageType": "counter", "fridgeTemperatureC": -1, "rating": 3.5,
             "createdAt": now},
        ]
        COLS["vendors"].insert_many(vendors)
        print("  [OK] Seeded 5 vendors")

    if COLS["products"].count_documents({}) == 0:
        products = [
            {"product_id": "P001", "product_name": "Idli Batter", "category": "batter", "unit_type": "kg",
             "shelf_life_ambient_hrs": 24, "shelf_life_fridge_hrs": 72},
            {"product_id": "P002", "product_name": "Dosa Batter", "category": "batter", "unit_type": "kg",
             "shelf_life_ambient_hrs": 20, "shelf_life_fridge_hrs": 60},
            {"product_id": "P003", "product_name": "Combo Pack", "category": "combo", "unit_type": "kg",
             "shelf_life_ambient_hrs": 18, "shelf_life_fridge_hrs": 54},
            {"product_id": "P004", "product_name": "Rava Batter", "category": "batter", "unit_type": "kg",
             "shelf_life_ambient_hrs": 16, "shelf_life_fridge_hrs": 48},
        ]
        COLS["products"].insert_many(products)
        print("  [OK] Seeded 4 products")

    if COLS["batches"].count_documents({}) == 0:
        batches = [
            {"batch_id": "B20000", "product_name": "Idli Batter", "manufacturer": "B2P Central Kitchen",
             "batch_number": "B20000", "mfg_timestamp": now - timedelta(hours=12),
             "volume_kg": 5.0, "initialPH": 4.4, "temperatureC": 28.0, "humidityPct": 55.0,
             "fermentationHours": 8.0, "vendor_id": "V100", "status": "received",
             "assigned_at": now - timedelta(hours=10), "received_at": now - timedelta(hours=8),
             "received_notes": "Good quality, delivered on time", "created_at": now - timedelta(hours=12)},
            {"batch_id": "B20001", "product_name": "Dosa Batter", "manufacturer": "B2P Central Kitchen",
             "batch_number": "B20001", "mfg_timestamp": now - timedelta(hours=6),
             "volume_kg": 3.0, "initialPH": 4.47, "temperatureC": 30.0, "humidityPct": 60.0,
             "fermentationHours": 7.5, "vendor_id": "V101", "status": "assigned",
             "assigned_at": now - timedelta(hours=4), "received_at": None,
             "received_notes": "", "created_at": now - timedelta(hours=6)},
            {"batch_id": "B20002", "product_name": "Combo Pack", "manufacturer": "B2P Central Kitchen",
             "batch_number": "B20002", "mfg_timestamp": now - timedelta(hours=2),
             "volume_kg": 4.0, "initialPH": 4.52, "temperatureC": 27.0, "humidityPct": 50.0,
             "fermentationHours": 9.0, "vendor_id": "", "status": "created",
             "assigned_at": None, "received_at": None,
             "received_notes": "", "created_at": now - timedelta(hours=2)},
            {"batch_id": "B20003", "product_name": "Idli Batter", "manufacturer": "B2P Central Kitchen",
             "batch_number": "B20003", "mfg_timestamp": now - timedelta(hours=1),
             "volume_kg": 6.0, "initialPH": 4.46, "temperatureC": 29.0, "humidityPct": 52.0,
             "fermentationHours": 8.5, "vendor_id": "V103", "status": "assigned",
             "assigned_at": now - timedelta(minutes=30), "received_at": None,
             "received_notes": "", "created_at": now - timedelta(hours=1)},
        ]
        COLS["batches"].insert_many(batches)
        print("  [OK] Seeded 4 batches")

    if COLS["inventory"].count_documents({}) == 0:
        inventory = [
            {"inventory_id": "INV001", "vendor_id": "V100", "product_name": "Idli Batter",
             "batch_number": "B20000", "quantity": 25, "minimum_stock": 10, "price": 120.0,
             "manufacture_date": now - timedelta(hours=12), "expiry_date": now + timedelta(hours=12),
             "freshness_score": 0.5, "received_at": now - timedelta(hours=8)},
            {"inventory_id": "INV002", "vendor_id": "V100", "product_name": "Dosa Batter",
             "batch_number": "B002", "quantity": 15, "minimum_stock": 10, "price": 140.0,
             "manufacture_date": now - timedelta(hours=20), "expiry_date": now + timedelta(hours=4),
             "freshness_score": 0.8, "received_at": now - timedelta(hours=18)},
        ]
        COLS["inventory"].insert_many(inventory)
        print("  [OK] Seeded 2 inventory items")


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
    print("\n  B2P Platform starting on http://localhost:5000\n")
    seed_data()
    app.run(debug=True, host="0.0.0.0", port=5000)
