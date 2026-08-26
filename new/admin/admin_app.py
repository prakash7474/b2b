"""
B2P Admin Panel - Flask Backend
Serves admin dashboard with all API endpoints.
"""

import os, math, traceback
from datetime import datetime, timedelta
from bson import ObjectId
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient, DESCENDING
import joblib
import pandas as pd
import numpy as np

app = Flask(__name__, static_folder="static")
CORS(app)

# ── MongoDB ─────────────────────────────────────────────────────
MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://rioprakash47_db_user:q7ngEz0PZF3L9szJ@cluster0.ziuzjl5.mongodb.net"
)
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client["b2p_admin"]

COLS = {
    "users": db["users"],
    "vendors": db["vendors"],
    "products": db["products"],
    "inventory": db["inventory"],
    "orders": db["orders"],
    "order_items": db["order_items"],
    "alerts": db["inventory_alerts"],
    "recommendations": db["vendor_recommendations"],
}

# ── Load ML models ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)

demand_bundle = joblib.load(os.path.join(PARENT_DIR, "demand_forecast_model.pkl"))
demand_model = demand_bundle["model"]
demand_features = demand_bundle["features"]
locality_encoder = demand_bundle["locality_encoder"]
festival_encoder = demand_bundle["festival_encoder"]
product_encoder = demand_bundle["product_encoder"]

spoilage_bundle = joblib.load(os.path.join(PARENT_DIR, "spoilage_risk_model.pkl"))
spoilage_model = spoilage_bundle["model"]
spoilage_features = spoilage_bundle["features"]
storage_encoder = spoilage_bundle["storage_encoder"]
label_encoder = spoilage_bundle["label_encoder"]

KNOWN_LOCALITIES = list(locality_encoder.classes_)
KNOWN_FESTIVALS = list(festival_encoder.classes_)
KNOWN_PRODUCTS = list(product_encoder.classes_)
KNOWN_STORAGE = list(storage_encoder.classes_)


def safe_encode(enc, val, known):
    return int(enc.transform([val])[0]) if val in known else 0


def jsonify_doc(doc):
    """Convert MongoDB doc to JSON-safe dict."""
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
            try: return datetime.strptime(val, fmt)
            except: pass
    if isinstance(val, datetime):
        return val
    return datetime.utcnow()


# ════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════
@app.route("/api/dashboard")
def dashboard():
    vendors = COLS["vendors"]
    inventory = COLS["inventory"]
    orders = COLS["orders"]
    alerts = COLS["alerts"]

    total_vendors = vendors.count_documents({})
    verified_vendors = vendors.count_documents({"verification_status": "verified"})
    total_inventory = inventory.count_documents({})
    total_stock = sum(d.get("quantity", 0) for d in inventory.find({}, {"quantity": 1}))
    low_stock = inventory.count_documents({"$expr": {"$lte": ["$quantity", "$minimum_stock"]}})
    high_freshness_risk = inventory.count_documents({"freshness_score": {"$gt": 0.7}})
    total_orders = orders.count_documents({})
    pending_orders = orders.count_documents({"order_status": {"$in": ["pending", "confirmed", "preparing"]}})
    active_alerts = alerts.count_documents({"alert_status": "active"})

    return jsonify({
        "totalVendors": total_vendors,
        "verifiedVendors": verified_vendors,
        "totalInventoryItems": total_inventory,
        "totalStockQuantity": total_stock,
        "lowStockItems": low_stock,
        "highFreshnessRisk": high_freshness_risk,
        "totalOrders": total_orders,
        "pendingOrders": pending_orders,
        "activeAlerts": active_alerts,
    })


# ════════════════════════════════════════════════════════════════
# VENDORS
# ════════════════════════════════════════════════════════════════
@app.route("/api/vendors")
def get_vendors():
    docs = list(COLS["vendors"].find({}))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/vendors/<vendor_id>")
def get_vendor(vendor_id):
    doc = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not doc:
        return jsonify({"error": "Vendor not found"}), 404
    return jsonify(jsonify_doc(doc))


@app.route("/api/vendors/<vendor_id>/inventory")
def get_vendor_inventory(vendor_id):
    docs = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/vendors/<vendor_id>/orders")
def get_vendor_orders(vendor_id):
    docs = list(COLS["orders"].find({"vendor_id": vendor_id, "delivery_type": "delivery"}).sort("order_date", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/vendors/<vendor_id>/verify", methods=["PUT"])
def verify_vendor(vendor_id):
    """Confirm or reject a vendor registration."""
    try:
        data = request.json
        action = data.get("action", "verify")  # "verify" or "reject"
        status = "verified" if action == "verify" else "rejected"
        result = COLS["vendors"].update_one(
            {"vendor_id": vendor_id},
            {"$set": {"verification_status": status}}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Vendor not found"}), 404
        return jsonify({"ok": True, "vendorId": vendor_id, "status": status})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ════════════════════════════════════════════════════════════════
# INVENTORY
# ════════════════════════════════════════════════════════════════
@app.route("/api/inventory")
def get_inventory():
    docs = list(COLS["inventory"].find({}))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/inventory/<inventory_id>")
def get_inventory_item(inventory_id):
    doc = COLS["inventory"].find_one({"inventory_id": inventory_id})
    if not doc:
        return jsonify({"error": "Not found"}), 404
    return jsonify(jsonify_doc(doc))


# ════════════════════════════════════════════════════════════════
# ORDERS
# ════════════════════════════════════════════════════════════════
@app.route("/api/orders")
def get_orders():
    query = {}
    if request.args.get("vendor_id"):
        query["vendor_id"] = request.args["vendor_id"]
    if request.args.get("order_status"):
        query["order_status"] = request.args["order_status"]
    if request.args.get("payment_status"):
        query["payment_status"] = request.args["payment_status"]
    if request.args.get("search"):
        q = request.args["search"]
        query["$or"] = [
            {"order_id": {"$regex": q, "$options": "i"}},
            {"user_id": {"$regex": q, "$options": "i"}},
            {"delivery_address": {"$regex": q, "$options": "i"}},
        ]
    docs = list(COLS["orders"].find(query).sort("order_date", DESCENDING))
    return jsonify([jsonify_doc(d) for d in docs])


@app.route("/api/orders/<order_id>")
def get_order(order_id):
    doc = COLS["orders"].find_one({"order_id": order_id})
    if not doc:
        return jsonify({"error": "Not found"}), 404
    items = list(COLS["order_items"].find({"order_id": order_id}))
    result = jsonify_doc(doc)
    result["items"] = [jsonify_doc(i) for i in items]
    return jsonify(result)


# ════════════════════════════════════════════════════════════════
# ALERTS
# ════════════════════════════════════════════════════════════════
@app.route("/api/alerts")
def get_alerts():
    query = {}
    if request.args.get("alert_type"):
        query["alert_type"] = request.args["alert_type"]
    if request.args.get("alert_status"):
        query["alert_status"] = request.args["alert_status"]
    docs = list(COLS["alerts"].find(query).sort("generated_time", DESCENDING))
    result = []
    for d in docs:
        item = jsonify_doc(d)
        inv = COLS["inventory"].find_one({"inventory_id": d.get("inventory_id")})
        if inv:
            item["inventory"] = jsonify_doc(inv)
        result.append(item)
    return jsonify(result)


# ════════════════════════════════════════════════════════════════
# RECOMMENDATIONS
# ════════════════════════════════════════════════════════════════
@app.route("/api/recommendations")
def get_recommendations():
    docs = list(COLS["recommendations"].find({}).sort("recommendation_rank", 1))
    result = []
    for d in docs:
        item = jsonify_doc(d)
        v = COLS["vendors"].find_one({"vendor_id": d.get("vendor_id")})
        if v:
            item["vendor_name"] = v.get("shop_name", "")
        result.append(item)
    return jsonify(result)


# ════════════════════════════════════════════════════════════════
# ML: DEMAND FORECAST
# ════════════════════════════════════════════════════════════════
@app.route("/api/vendors/<vendor_id>/demand-forecast")
def demand_forecast(vendor_id):
    vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404

    # Get vendor's inventory for current stock
    inv_items = list(COLS["inventory"].find({"vendor_id": vendor_id}))
    total_stock = sum(i.get("quantity", 0) for i in inv_items)
    min_stock = sum(i.get("minimum_stock", 0) for i in inv_items)

    # Get vendor's recent orders for historical sales
    recent_orders = list(COLS["orders"].find({"vendor_id": vendor_id}).sort("order_date", DESCENDING).limit(30))
    historical_sales = len(recent_orders) * 15  # avg units per order

    # Compute lag/rolling features from order history
    lag1 = max(5, historical_sales // max(1, len(recent_orders)) * 3) if recent_orders else 15
    lag7 = lag1 * 0.9
    rolling7_mean = (lag1 + lag7) / 2 + 2
    rolling28_mean = rolling7_mean * 0.95
    same_slot_4wk = rolling7_mean * 1.1

    now = datetime.utcnow()
    date_str = now.strftime("%Y-%m-%d")
    weekday = now.weekday()
    hour = 7  # morning
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    weekday_sin = math.sin(2 * math.pi * weekday / 7)
    weekday_cos = math.cos(2 * math.pi * weekday / 7)

    # Use vendor's locality if available, else default
    locality = vendor.get("localityTier", "residential_budget")
    hotspot = vendor.get("hotspotDensityScore", 30)

    # Get first product for this vendor
    product_id = inv_items[0].get("product_name", "Idly_Batter") if inv_items else "Idly_Batter"
    # Map product name to model's expected productId
    product_map = {"Idli Batter": "Idly_Batter", "Dosa Batter": "Dosa_Batter", "Combo Pack": "Combo_Pack", "Rava Batter": "Dosa_Batter"}
    product_for_model = product_map.get(product_id, "Idly_Batter")

    feature_dict = {
        "hourSin": round(hour_sin, 4), "hourCos": round(hour_cos, 4),
        "weekdaySin": round(weekday_sin, 4), "weekdayCos": round(weekday_cos, 4),
        "isWeekend": 1 if weekday >= 5 else 0, "isFestivalWindow": 0,
        "forecastTemperatureC": 31.0, "forecastRainProbability": 0.2,
        "lag1": lag1, "lag7": lag7,
        "rolling7DayMean": round(rolling7_mean, 2), "rolling7DayStd": 4.0,
        "sameSlot4WeekMean": round(same_slot_4wk, 2),
        "recentTrend": round(rolling7_mean / rolling28_mean if rolling28_mean > 0 else 1.0, 4),
        "localityTierEnc": safe_encode(locality_encoder, locality, KNOWN_LOCALITIES),
        "hotspotDensityScore": hotspot,
        "productIdEnc": safe_encode(product_encoder, product_for_model, KNOWN_PRODUCTS),
    }

    row = pd.DataFrame([feature_dict])[demand_features]
    predicted = max(0, round(float(demand_model.predict(row)[0]), 1))
    safety_stock = 5.0
    recommended_dispatch = max(0, round(predicted + safety_stock - total_stock, 1))

    return jsonify({
        "vendorId": vendor_id,
        "shopName": vendor.get("shop_name", ""),
        "predictedDemand": predicted,
        "recommendedDispatch": recommended_dispatch,
        "currentStock": total_stock,
        "minimumStock": min_stock,
        "historicalSales": historical_sales,
        "recentOrders": len(recent_orders),
        "dataSource": "ML Model (XGBoost)",
    })


# ════════════════════════════════════════════════════════════════
# ML: SPOILAGE RISK
# ════════════════════════════════════════════════════════════════
@app.route("/api/inventory/<inventory_id>/spoilage-risk")
def spoilage_risk(inventory_id):
    inv = COLS["inventory"].find_one({"inventory_id": inventory_id})
    if not inv:
        return jsonify({"error": "Not found"}), 404

    vendor = COLS["vendors"].find_one({"vendor_id": inv.get("vendor_id")})
    now = datetime.utcnow()

    mfg = inv.get("manufacture_date", now)
    if isinstance(mfg, str):
        mfg = parse_date(mfg)
    hours_since_mfg = max(0, (now - mfg).total_seconds() / 3600)

    received = inv.get("received_at", now)
    if isinstance(received, str):
        received = parse_date(received)
    hours_on_shelf = max(0, (now - received).total_seconds() / 3600)

    expiry = inv.get("expiry_date", now + timedelta(hours=24))
    if isinstance(expiry, str):
        expiry = parse_date(expiry)
    hours_to_expiry = max(0, (expiry - now).total_seconds() / 3600)

    has_fridge = 1 if vendor and vendor.get("verification_status") == "verified" else 0
    fridge_temp = 4.5 if has_fridge else -1
    ambient_temp = 31.0
    storage_type = "fridge" if has_fridge else "counter"

    # Count orders for this vendor to estimate sell-through
    order_count = COLS["orders"].count_documents({"vendor_id": inv.get("vendor_id")})
    sell_through = min(1.0, order_count / max(1, inv.get("quantity", 10) + order_count))

    temp_exposure = (fridge_temp if has_fridge else ambient_temp) * hours_since_mfg

    feature_dict = {
        "initialPH": 4.4, "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hasRefrigerator": has_fridge,
        "storageTypeEnc": safe_encode(storage_encoder, storage_type, KNOWN_STORAGE),
        "ambientTemperatureC": ambient_temp, "humidityPct": 65.0,
        "fridgeTemperatureC": fridge_temp,
        "hoursOnShelf": round(hours_on_shelf, 1),
        "sellThroughRate": round(sell_through, 2),
        "effectiveTemperatureExposure": round(temp_exposure, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "volumeKg": 1.0,
        "vendorRating": vendor.get("rating", 4.0) if vendor else 4.0,
    }

    row = pd.DataFrame([feature_dict])[spoilage_features]
    pred_enc = spoilage_model.predict(row)[0]
    risk_label = label_encoder.inverse_transform([pred_enc])[0]
    proba = spoilage_model.predict_proba(row)[0]
    confidence = round(float(max(proba)) * 100, 1)

    # Also show freshness_score from DB
    fs = inv.get("freshness_score", 0)
    if fs < 0.3:
        fs_risk = "Low"
    elif fs <= 0.7:
        fs_risk = "Medium"
    else:
        fs_risk = "High"

    return jsonify({
        "inventoryId": inventory_id,
        "productId": inv.get("product_name", ""),
        "batchNumber": inv.get("batch_number", ""),
        "mlRiskLabel": risk_label,
        "mlConfidence": confidence,
        "mlProbabilities": {label_encoder.classes_[i]: round(float(p) * 100, 1) for i, p in enumerate(proba)},
        "freshnessScore": fs,
        "freshnessRisk": fs_risk,
        "manufactureDate": mfg.isoformat() if isinstance(mfg, datetime) else str(mfg),
        "expiryDate": expiry.isoformat() if isinstance(expiry, datetime) else str(expiry),
        "hoursSinceManufacture": round(hours_since_mfg, 1),
        "hoursToExpiry": round(hours_to_expiry, 1),
        "dataSource": "ML Model (Random Forest) + DB freshness_score",
    })


# ════════════════════════════════════════════════════════════════
# SERVE UI
# ════════════════════════════════════════════════════════════════
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    from seed_data import seed
    print("\n  B2P Admin Panel starting on http://localhost:5001\n")
    seed()
    app.run(debug=True, host="0.0.0.0", port=5001)
