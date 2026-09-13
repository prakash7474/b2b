import os
import traceback
from datetime import datetime, timedelta

import joblib
import pandas as pd
from pymongo import DESCENDING
from flask import request, jsonify

import backend.database as _db
from backend.database import parse_date, jsonify_doc
from backend.services.constants import PRODUCT_NAME_TO_ID, STORAGE_TYPE_MAP, safe_encode
from backend.config import app

# ── ML model loading ────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("Loading spoilage risk model...")
spoilage_bundle = joblib.load(os.path.join(BASE_DIR, "spoilage_risk_model.pkl"))
spoilage_model = spoilage_bundle["model"]
spoilage_features = spoilage_bundle["features"]
storage_encoder = spoilage_bundle["storage_encoder"]
label_encoder = spoilage_bundle["label_encoder"]
print(f"  [OK] Spoilage model loaded")

KNOWN_STORAGE = list(storage_encoder.classes_)


@app.route("/api/vendors/<vendor_id>/predict-spoilage")
def predict_spoilage_for_vendor(vendor_id):
    """Auto-derived spoilage risk for a specific vendor based on their real stock, refrigeration, and batch age."""
    vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404

    now = datetime.utcnow()
    
    # Vendor storage parameters
    has_fridge = 1 if vendor.get("hasRefrigerator") else 0
    fridge_temp = float(vendor.get("fridgeTemperatureC", 4.0)) if has_fridge else -1.0
    storage_type = vendor.get("storageType", "counter")
    vendor_rating = float(vendor.get("rating", 4.0))

    inv_item = _db.COLS["inventory"].find_one({"vendor_id": vendor_id})
    inv_qty = float(inv_item.get("quantity", 0.0)) if inv_item else 0.0

    # Only look for active received batches in store (NOT assigned or stocked out)
    active_batch = _db.COLS["batches"].find_one(
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
        pred_res = _db.COLS["predictions"].insert_one({
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

        _db.COLS["feature_snapshots"].insert_one({
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


# ==============================================================================
# ROUTE: GET /api/batches/<batch_id>/predict-spoilage
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   1. Loads the batch document from MongoDB by `batch_id`.
#   2. If batch is archived or stockout: skips ML scoring and returns stockout message.
#   3. Pulls store refrigeration parameters from `COLS["vendors"]`.
#   4. Computes biological age (now - mfgTimestamp) and actual sell-through rate
#      from the `inventory_movement` ledger.
#   5. Evaluates the 13-feature vector using the Random Forest classifier.
#   6. Persists the inference result and feature snapshot into MongoDB collections.
# ==============================================================================
@app.route("/api/batches/<batch_id>/predict-spoilage")
def predict_spoilage_for_batch(batch_id):
    """Auto-derived spoilage risk from real batch/vendor/inventory data.
    
    Computes all 13 ML features from:
    - BATCHES.initialPH, mfgTimestamp, volume_kg, temperatureC, humidityPct
    - VENDORS.hasRefrigerator, storageType, fridgeTemperatureC, rating
    - INVENTORY.quantity vs ORDER_ITEMS → sell-through rate
    - Derived: hoursSinceManufacture, hoursOnShelf, effectiveTempExposure
    """
    batch = _db.COLS["batches"].find_one({"batch_id": batch_id})
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    vendor = _db.COLS["vendors"].find_one({"vendor_id": batch.get("vendor_id")})
    now = datetime.utcnow()

    # If batch is marked stockout / depleted / archived — skip ML scoring
    if batch.get("status") in ("stockout", "archived"):
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
    inv_item = _db.COLS["inventory"].find_one({"batch_number": batch.get("batch_number", batch_id)})
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
    move_count = _db.COLS["inventory_movement"].count_documents(
        {"vendorId": vendor_id, "movementType": "sale"}
    ) if vendor_id else 0
    if move_count > 0:
        total_sold = abs(sum(
            m.get("quantity", 0) for m in
            _db.COLS["inventory_movement"].find({"vendorId": vendor_id, "movementType": "sale"}, {"quantity": 1})
        ))
        batch_qty = inv_item.get("quantity", 10) if inv_item else batch.get("volume_kg", 1.0)
        sell_through = min(1.0, total_sold / max(1, batch_qty + total_sold))
    else:
        # Fallback: order count proxy
        order_count = _db.COLS["orders"].count_documents({"vendor_id": vendor_id}) if vendor_id else 0
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
        pred_res = _db.COLS["predictions"].insert_one({
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

        _db.COLS["feature_snapshots"].insert_one({
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
