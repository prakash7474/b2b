"""
B2P ML Prediction Dashboard
Flask app with MongoDB integration for demand forecasting and spoilage risk prediction.
"""

import os
import json
import math
import traceback
from datetime import datetime, timedelta
from bson import ObjectId
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
import joblib
import pandas as pd
import numpy as np

# ── Flask setup ──────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static")
CORS(app)

# ── MongoDB connection ──────────────────────────────────────────────
MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://rioprakash47_db_user:q7ngEz0PZF3L9szJ@cluster0.ziuzjl5.mongodb.net"
)
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client["b2p_ml"]

# Collections
predictions_col = db["predictions"]
vendors_col = db["vendors"]
products_col = db["products"]
batches_col = db["batches"]
inventory_col = db["inventory"]
movements_col = db["inventory_movements"]

# ── Load models ─────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

print("Loading demand forecast model...")
demand_bundle = joblib.load(os.path.join(BASE_DIR, "demand_forecast_model.pkl"))
demand_model = demand_bundle["model"]
demand_features = demand_bundle["features"]
locality_encoder = demand_bundle["locality_encoder"]
festival_encoder = demand_bundle["festival_encoder"]
product_encoder = demand_bundle["product_encoder"]
print(f"  [OK] Demand model loaded. Features: {demand_features}")

print("Loading spoilage risk model...")
spoilage_bundle = joblib.load(os.path.join(BASE_DIR, "spoilage_risk_model.pkl"))
spoilage_model = spoilage_bundle["model"]
spoilage_features = spoilage_bundle["features"]
storage_encoder = spoilage_bundle["storage_encoder"]
label_encoder = spoilage_bundle["label_encoder"]
print(f"  [OK] Spoilage model loaded. Features: {spoilage_features}")

# ── Encoding helpers ────────────────────────────────────────────────
# Get known labels from training encoders
KNOWN_LOCALITIES = list(locality_encoder.classes_)
KNOWN_FESTIVALS = list(festival_encoder.classes_)
KNOWN_PRODUCTS = list(product_encoder.classes_)
KNOWN_STORAGE = list(storage_encoder.classes_)


def safe_encode(encoder, value, known_labels):
    """Encode a value, falling back to first known label if unseen."""
    if value in known_labels:
        return int(encoder.transform([value])[0])
    return 0  # default fallback


# ── API: Predict Demand ────────────────────────────────────────────
@app.route("/api/predict-demand", methods=["POST"])
def predict_demand():
    """Predict demand for a vendor/product/window combination."""
    try:
        data = request.json

        # Parse inputs
        date_str = data.get("date", "2026-03-01")
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        window = data.get("window", "morning")  # morning or evening
        vendor_id = data.get("vendorId", "V100")
        product_id = data.get("productId", "Idly_Batter")
        temperature = float(data.get("temperature", 30.0))
        rain_prob = float(data.get("rainProbability", 0.2))
        locality = data.get("localityTier", "residential_budget")
        festival = data.get("festivalType", "none")
        hotspot_score = float(data.get("hotspotDensityScore", 30.0))
        available_stock = float(data.get("availableStock", 20.0))
        lag1 = float(data.get("lag1", 20.0))
        lag7 = float(data.get("lag7", 18.0))
        rolling7_mean = float(data.get("rolling7DayMean", 19.0))
        rolling7_std = float(data.get("rolling7DayStd", 4.0))
        rolling28_mean = float(data.get("rolling28DayMean", 20.0))
        same_slot_4wk = float(data.get("sameSlot4WeekMean", 21.0))

        # Time features
        hour = 7 if window == "morning" else 17  # mid-point hours
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        weekday = target_date.weekday()
        weekday_sin = math.sin(2 * math.pi * weekday / 7)
        weekday_cos = math.cos(2 * math.pi * weekday / 7)
        is_weekend = 1 if weekday >= 5 else 0
        is_festival = 1 if festival != "none" else 0
        recent_trend = rolling7_mean / rolling28_mean if rolling28_mean > 0 else 1.0

        # Build feature dict
        feature_dict = {
            "hourSin": round(hour_sin, 4),
            "hourCos": round(hour_cos, 4),
            "weekdaySin": round(weekday_sin, 4),
            "weekdayCos": round(weekday_cos, 4),
            "isWeekend": is_weekend,
            "isFestivalWindow": is_festival,
            "forecastTemperatureC": temperature,
            "forecastRainProbability": rain_prob,
            "lag1": lag1,
            "lag7": lag7,
            "rolling7DayMean": rolling7_mean,
            "rolling7DayStd": rolling7_std,
            "sameSlot4WeekMean": same_slot_4wk,
            "recentTrend": round(recent_trend, 4),
            "localityTierEnc": safe_encode(locality_encoder, locality, KNOWN_LOCALITIES),
            "hotspotDensityScore": hotspot_score,
            "productIdEnc": safe_encode(product_encoder, product_id, KNOWN_PRODUCTS),
        }

        # Create DataFrame with correct feature order
        row = pd.DataFrame([feature_dict])[demand_features]

        # Predict
        predicted_demand = float(demand_model.predict(row)[0])
        predicted_demand = max(0, round(predicted_demand, 1))

        # Calculate recommended dispatch
        safety_stock = float(data.get("safetyStock", 5.0))
        recommended_dispatch = max(0, predicted_demand + safety_stock - available_stock)
        recommended_dispatch = round(recommended_dispatch, 1)

        result = {
            "predictedDemand": predicted_demand,
            "recommendedDispatch": recommended_dispatch,
            "vendorId": vendor_id,
            "productId": product_id,
            "date": date_str,
            "window": window,
            "features": feature_dict,
        }

        # Store in MongoDB
        prediction_doc = {
            "predictionType": "DEMAND",
            "vendorId": vendor_id,
            "productId": product_id,
            "date": target_date,
            "window": window,
            "predictedValue": predicted_demand,
            "recommendedDispatch": recommended_dispatch,
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": datetime.utcnow(),
        }
        predictions_col.insert_one(prediction_doc)

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ── API: Predict Spoilage Risk ──────────────────────────────────────
@app.route("/api/predict-spoilage", methods=["POST"])
def predict_spoilage():
    """Predict spoilage risk for a batch."""
    try:
        data = request.json

        # Parse inputs
        vendor_id = data.get("vendorId", "V100")
        batch_id = data.get("batchId", "B20000")
        product_id = data.get("productId", "Idly_Batter")
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

        # Effective temperature exposure
        temp_exposure = (fridge_temp if has_refrigerator else ambient_temp) * hours_since_mfg

        # Build feature dict
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

        # Create DataFrame with correct feature order
        row = pd.DataFrame([feature_dict])[spoilage_features]

        # Predict
        pred_encoded = spoilage_model.predict(row)[0]
        risk_label = label_encoder.inverse_transform([pred_encoded])[0]

        # Get probability
        proba = spoilage_model.predict_proba(row)[0]
        confidence = round(float(max(proba)) * 100, 1)

        result = {
            "riskLabel": risk_label,
            "confidence": confidence,
            "probabilities": {
                label_encoder.classes_[i]: round(float(p) * 100, 1)
                for i, p in enumerate(proba)
            },
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": product_id,
            "features": feature_dict,
        }

        # Store in MongoDB
        prediction_doc = {
            "predictionType": "SPOILAGE_RISK",
            "vendorId": vendor_id,
            "batchId": batch_id,
            "productId": product_id,
            "predictedValue": risk_label,
            "confidence": confidence,
            "inputFeatures": feature_dict,
            "modelVersion": "v1.0",
            "generatedAt": datetime.utcnow(),
        }
        predictions_col.insert_one(prediction_doc)

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# ── API: Prediction History ─────────────────────────────────────────
@app.route("/api/history", methods=["GET"])
def get_history():
    """Get recent predictions from MongoDB."""
    try:
        pred_type = request.args.get("type", None)
        limit = int(request.args.get("limit", 20))

        query = {}
        if pred_type:
            query["predictionType"] = pred_type

        cursor = predictions_col.find(query).sort("generatedAt", -1).limit(limit)
        results = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])
            if isinstance(doc.get("generatedAt"), datetime):
                doc["generatedAt"] = doc["generatedAt"].isoformat()
            if isinstance(doc.get("date"), datetime):
                doc["date"] = doc["date"].isoformat()
            results.append(doc)

        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── API: Stats ──────────────────────────────────────────────────────
@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Get prediction statistics."""
    try:
        total = predictions_col.count_documents({})
        demand_count = predictions_col.count_documents({"predictionType": "DEMAND"})
        spoilage_count = predictions_col.count_documents({"predictionType": "SPOILAGE_RISK"})

        return jsonify({
            "totalPredictions": total,
            "demandPredictions": demand_count,
            "spoilagePredictions": spoilage_count,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── CRUD: Vendors ────────────────────────────────────────────────────
@app.route("/api/vendors", methods=["GET"])
def get_vendors():
    try:
        cursor = vendors_col.find({}, {"_id": 0})
        return jsonify(list(cursor))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/vendors", methods=["POST"])
def create_vendor():
    try:
        data = request.json
        vendor_id = data.get("vendorId", "").strip()
        if not vendor_id:
            return jsonify({"error": "vendorId is required"}), 400

        if vendors_col.find_one({"vendorId": vendor_id}):
            return jsonify({"error": f"Vendor {vendor_id} already exists"}), 409

        doc = {
            "vendorId": vendor_id,
            "shopName": data.get("shopName", ""),
            "localityTier": data.get("localityTier", "residential_budget"),
            "hotspotDensityScore": float(data.get("hotspotDensityScore", 30)),
            "hasRefrigerator": data.get("hasRefrigerator", "0") == "1",
            "storageType": data.get("storageType", "counter"),
            "fridgeTemperatureC": float(data.get("fridgeTemperatureC", 5)),
            "rating": float(data.get("rating", 4.0)),
            "createdAt": datetime.utcnow(),
        }
        vendors_col.insert_one(doc)
        return jsonify({"ok": True, "vendorId": vendor_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/vendors/<vendor_id>", methods=["DELETE"])
def delete_vendor(vendor_id):
    try:
        vendors_col.delete_one({"vendorId": vendor_id})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── CRUD: Products ──────────────────────────────────────────────────
@app.route("/api/products", methods=["GET"])
def get_products():
    try:
        cursor = products_col.find({}, {"_id": 0})
        return jsonify(list(cursor))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/products", methods=["POST"])
def create_product():
    try:
        data = request.json
        product_id = data.get("productId", "").strip()
        if not product_id:
            return jsonify({"error": "productId is required"}), 400

        if products_col.find_one({"productId": product_id}):
            return jsonify({"error": f"Product {product_id} already exists"}), 409

        doc = {
            "productId": product_id,
            "name": data.get("name", product_id),
            "category": data.get("category", "batter"),
            "unitType": data.get("unitType", "kg"),
            "shelfLifeHoursAmbient": int(data.get("shelfLifeHoursAmbient", 24)),
            "shelfLifeHoursFridge": int(data.get("shelfLifeHoursFridge", 72)),
            "createdAt": datetime.utcnow(),
        }
        products_col.insert_one(doc)
        return jsonify({"ok": True, "productId": product_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/products/<product_id>", methods=["DELETE"])
def delete_product(product_id):
    try:
        products_col.delete_one({"productId": product_id})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── CRUD: Batches ──────────────────────────────────────────────────
@app.route("/api/batches", methods=["GET"])
def get_batches():
    try:
        cursor = batches_col.find({}, {"_id": 0})
        result = []
        for doc in cursor:
            if isinstance(doc.get("mfgTimestamp"), datetime):
                doc["mfgTimestamp"] = doc["mfgTimestamp"].isoformat()
            result.append(doc)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches", methods=["POST"])
def create_batch():
    try:
        data = request.json
        batch_id = data.get("batchId", "").strip()
        if not batch_id:
            return jsonify({"error": "batchId is required"}), 400

        if batches_col.find_one({"batchId": batch_id}):
            return jsonify({"error": f"Batch {batch_id} already exists"}), 409

        doc = {
            "batchId": batch_id,
            "productId": data.get("productId", "Idly_Batter"),
            "vendorId": data.get("vendorId", ""),
            "manufacturerId": data.get("manufacturerId", "MFG001"),
            "batchNumber": data.get("batchNumber", batch_id),
            "mfgTimestamp": datetime.fromisoformat(data.get("mfgTimestamp", datetime.utcnow().isoformat())),
            "volume": float(data.get("volume", 1.0)),
            "initialPH": float(data.get("initialPH", 4.4)),
            "createdAt": datetime.utcnow(),
        }
        batches_col.insert_one(doc)
        return jsonify({"ok": True, "batchId": batch_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route("/api/batches/<batch_id>", methods=["DELETE"])
def delete_batch(batch_id):
    try:
        batches_col.delete_one({"batchId": batch_id})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Seed data ───────────────────────────────────────────────────────
def seed_data():
    """Insert sample data if collections are empty."""
    if vendors_col.count_documents({}) == 0:
        vendors = [
            {"vendorId": "V100", "shopName": "Lakshmi Idli Shop", "localityTier": "residential_budget", "hotspotDensityScore": 33, "hasRefrigerator": True, "storageType": "fridge", "fridgeTemperatureC": 4.9, "rating": 4.2, "createdAt": datetime.utcnow()},
            {"vendorId": "V101", "shopName": "Karthik Dosa Center", "localityTier": "commercial", "hotspotDensityScore": 52, "hasRefrigerator": False, "storageType": "backroom", "fridgeTemperatureC": -1, "rating": 3.7, "createdAt": datetime.utcnow()},
            {"vendorId": "V102", "shopName": "Fresh Batter Corner", "localityTier": "residential_premium", "hotspotDensityScore": 41, "hasRefrigerator": False, "storageType": "backroom", "fridgeTemperatureC": -1, "rating": 4.3, "createdAt": datetime.utcnow()},
            {"vendorId": "V103", "shopName": "Campus Canteen", "localityTier": "institutional", "hotspotDensityScore": 60, "hasRefrigerator": True, "storageType": "counter", "fridgeTemperatureC": 6.3, "rating": 4.4, "createdAt": datetime.utcnow()},
            {"vendorId": "V104", "shopName": "RK Batter House", "localityTier": "residential_budget", "hotspotDensityScore": 25, "hasRefrigerator": False, "storageType": "counter", "fridgeTemperatureC": -1, "rating": 3.9, "createdAt": datetime.utcnow()},
        ]
        vendors_col.insert_many(vendors)
        print("  [OK] Seeded 5 vendors")

    if products_col.count_documents({}) == 0:
        products = [
            {"productId": "Idly_Batter", "name": "Idly Batter", "category": "batter", "unitType": "kg", "shelfLifeHoursAmbient": 24, "shelfLifeHoursFridge": 72, "createdAt": datetime.utcnow()},
            {"productId": "Dosa_Batter", "name": "Dosa Batter", "category": "batter", "unitType": "kg", "shelfLifeHoursAmbient": 20, "shelfLifeHoursFridge": 60, "createdAt": datetime.utcnow()},
            {"productId": "Combo_Pack", "name": "Combo Pack (Idly + Dosa)", "category": "combo", "unitType": "kg", "shelfLifeHoursAmbient": 18, "shelfLifeHoursFridge": 54, "createdAt": datetime.utcnow()},
        ]
        products_col.insert_many(products)
        print("  [OK] Seeded 3 products")

    if batches_col.count_documents({}) == 0:
        batches = [
            {"batchId": "B20000", "productId": "Idly_Batter", "vendorId": "V100", "manufacturerId": "MFG001", "batchNumber": "B20000", "mfgTimestamp": datetime(2026, 2, 27, 6, 0), "volume": 1.0, "initialPH": 4.4, "createdAt": datetime.utcnow()},
            {"batchId": "B20001", "productId": "Idly_Batter", "vendorId": "V101", "manufacturerId": "MFG001", "batchNumber": "B20001", "mfgTimestamp": datetime(2026, 2, 26, 18, 0), "volume": 2.0, "initialPH": 4.47, "createdAt": datetime.utcnow()},
            {"batchId": "B20002", "productId": "Dosa_Batter", "vendorId": "V102", "manufacturerId": "MFG001", "batchNumber": "B20002", "mfgTimestamp": datetime(2026, 2, 26, 6, 0), "volume": 1.0, "initialPH": 4.52, "createdAt": datetime.utcnow()},
            {"batchId": "B20003", "productId": "Idly_Batter", "vendorId": "V103", "manufacturerId": "MFG001", "batchNumber": "B20003", "mfgTimestamp": datetime(2026, 2, 28, 12, 0), "volume": 1.0, "initialPH": 4.46, "createdAt": datetime.utcnow()},
            {"batchId": "B20004", "productId": "Combo_Pack", "vendorId": "V104", "manufacturerId": "MFG001", "batchNumber": "B20004", "mfgTimestamp": datetime(2026, 2, 28, 8, 0), "volume": 2.0, "initialPH": 4.38, "createdAt": datetime.utcnow()},
        ]
        batches_col.insert_many(batches)
        print("  [OK] Seeded 5 batches")


# ── Serve UI ────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ── Run ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n  B2P ML Dashboard starting on http://localhost:5000\n")
    seed_data()
    app.run(debug=True, host="0.0.0.0", port=5000)
