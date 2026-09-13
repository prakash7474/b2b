import os
import math
import traceback
from datetime import datetime, timedelta

import joblib
import pandas as pd
import numpy as np
from flask import request, jsonify

import backend.database as _db
from backend.database import parse_date
from backend.services.weather import get_weather_for_date
from backend.services.festivals import get_festival_context
from backend.services.constants import PRODUCT_NAME_TO_ID, FESTIVAL_MAP, safe_encode
from backend.config import app

# ── ML model loading ────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("Loading demand forecast model...")
demand_bundle = joblib.load(os.path.join(BASE_DIR, "demand_forecast_model.pkl"))
demand_model = demand_bundle["model"]
demand_features = demand_bundle["features"]
locality_encoder = demand_bundle["locality_encoder"]
festival_encoder = demand_bundle["festival_encoder"]
product_encoder = demand_bundle["product_encoder"]
print(f"  [OK] Demand model loaded")

KNOWN_LOCALITIES = list(locality_encoder.classes_)
KNOWN_FESTIVALS = list(festival_encoder.classes_)
KNOWN_PRODUCTS = list(product_encoder.classes_)


def compute_sales_features(vendor_id, product_name, target_date, window, prefetched=None):
    """Compute ML demand features from actual order history in the database.
    
    Returns a dict with all 17 features for the XGBoost demand model.
    Based on B2P_ML_Parameter_Lists_2Pages.html Layer 1 specs.
    Optionally accepts a `prefetched` dict for high-throughput batch execution.
    """
    now = datetime.utcnow()
    # Morning batch dispatches at 07:00 (7 AM); Evening batch dispatches at 17:00 (5 PM)
    hour = 7 if window == "morning" else 17
    
    # ── 1. Cyclical Time Features (Trigonometric Transformations) ───────────────
    # Sin/Cos transforms map linear hours/days into a continuous circular manifold.
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    weekday = target_date.weekday()
    weekday_sin = math.sin(2 * math.pi * weekday / 7)
    weekday_cos = math.cos(2 * math.pi * weekday / 7)
    is_weekend = 1 if weekday >= 5 else 0
    
    # ── 2. Vendor Profile Features ──────────────────────────────────────────────
    if prefetched and "vendors_by_id" in prefetched:
        vendor = prefetched["vendors_by_id"].get(vendor_id)
    else:
        vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
    locality = vendor.get("localityTier", "residential_budget") if vendor else "residential_budget"
    hotspot = vendor.get("hotspotDensityScore", 30) if vendor else 30
    vendor_rating = vendor.get("rating", 4.0) if vendor else 4.0
    
    # ── 3. Product Identifier Mapping ───────────────────────────────────────────
    product_id = PRODUCT_NAME_TO_ID.get(product_name, product_name)
    
    # ── 4. Historical Sales Queries: Join ORDERS + ORDER_ITEMS ──────────────────
    if prefetched and "orders_by_vendor" in prefetched:
        vendor_orders = prefetched["orders_by_vendor"].get(vendor_id, [])
    else:
        vendor_orders = list(_db.COLS["orders"].find(
            {"vendor_id": vendor_id},
            {"order_id": 1, "order_date": 1}
        ).sort("order_date", -1).limit(100))

    if prefetched and "inv_by_vendor" in prefetched:
        v_inv = prefetched["inv_by_vendor"].get(vendor_id, [])
        inv_by_id = {i["inventory_id"]: i.get("product_name") for i in v_inv if i.get("inventory_id")}
    else:
        inv_by_id = {
            i["inventory_id"]: i.get("product_name")
            for i in _db.COLS["inventory"].find({"vendor_id": vendor_id})
            if i.get("inventory_id")
        }

    if prefetched and "order_items_by_order" in prefetched:
        order_ids = [o["order_id"] for o in vendor_orders]
        vendor_items = []
        for oid in order_ids:
            vendor_items.extend(prefetched["order_items_by_order"].get(oid, []))
    else:
        order_ids = [o["order_id"] for o in vendor_orders]
        vendor_items = list(_db.COLS["order_items"].find(
            {"order_id": {"$in": order_ids}} if order_ids else {},
            {"order_id": 1, "inventory_id": 1, "quantity": 1}
        ))

    # Map order_id → total units sold (scoped strictly to the target batter product)
    order_units = {}
    for item in vendor_items:
        if inv_by_id.get(item.get("inventory_id")) != product_name:
            continue
        oid = item["order_id"]
        order_units[oid] = order_units.get(oid, 0) + item.get("quantity", 0)
    
    # ── 5. Compute Time-Lagged & Rolling Sales Velocity ─────────────────────────
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
        
        # Immediate 24-hour lag
        if days_ago <= 1:
            lag1 += units
        # 7-day rolling window
        if days_ago <= 7:
            lag7 += units
            rolling_7d_sales.append(units)
        # 28-day rolling window (4 calendar weeks)
        if days_ago <= 28:
            rolling_28d_sales.append(units)
            # Match the exact weekday for same-slot seasonality (e.g. all Sundays in the month)
            if odate.weekday() == weekday:
                same_slot_4wk_sales.append(units)
    
    # Statistical aggregates with domain-informed cold-start defaults (15 kg baseline)
    rolling7_mean = sum(rolling_7d_sales) / max(1, len(rolling_7d_sales)) if rolling_7d_sales else 15.0
    rolling7_std = float(np.std(rolling_7d_sales)) if len(rolling_7d_sales) > 1 else 4.0
    rolling28_mean = sum(rolling_28d_sales) / max(1, len(rolling_28d_sales)) if rolling_28d_sales else 15.0
    same_slot_4wk = sum(same_slot_4wk_sales) / max(1, len(same_slot_4wk_sales)) if same_slot_4wk_sales else rolling7_mean
    
    # Cold-start fallback for brand new vendors with zero sales history
    if not vendor_orders:
        lag1 = 15.0
        lag7 = 14.0
        rolling7_mean = 15.0
        rolling7_std = 4.0
        rolling28_mean = 15.0
        same_slot_4wk = 16.0
    
    # Trend ratio: >1 means upward momentum, <1 means softening demand
    recent_trend = rolling7_mean / rolling28_mean if rolling28_mean > 0 else 1.0
    
    # ── 6. Physical Inventory Stock Verification ────────────────────────────────
    # Available stock is strictly zero if the vendor has NO active received batches.
    if prefetched and "received_by_vendor" in prefetched:
        active_received = prefetched["received_by_vendor"].get(vendor_id, [])
    else:
        active_received = list(_db.COLS["batches"].find({"vendor_id": vendor_id, "status": "received"}))

    if not active_received:
        available_stock = 0.0
    else:
        if prefetched and "inv_by_vendor" in prefetched:
            inv_items = prefetched["inv_by_vendor"].get(vendor_id, [])
        else:
            inv_items = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
        available_stock = sum(float(i.get("quantity", 0)) for i in inv_items)

    # ── 7. Weather Forecast Lookup ─────────────────────────────────────────────
    if prefetched and "weather" in prefetched:
        temperature, rain_prob = prefetched["weather"]
    else:
        temperature, rain_prob = get_weather_for_date(target_date)

    # ── 8. Festival Calendar Context ───────────────────────────────────────────
    if prefetched and "festival" in prefetched:
        is_festival, festival_type = prefetched["festival"]
    else:
        is_festival, festival_type = get_festival_context(target_date)

    # ── 9. Final 17-Feature Dictionary Assembly ────────────────────────────────
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


@app.route("/api/vendors/<vendor_id>/demand-forecast")
def demand_forecast(vendor_id):
    """Auto-derive demand forecast from real order/inventory data.
    
    Computes all 17 ML features from:
    - ORDERS.order_date → time features, lag, rolling averages
    - ORDER_ITEMS.quantity → actual units sold
    - INVENTORY.quantity → current stock
    - VENDORS → locality, hotspot, rating
    """
    vendor = _db.COLS["vendors"].find_one({"vendor_id": vendor_id})
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404
    
    now = datetime.utcnow()
    product_name = "Idli Batter"  # default product
    
    # Get product from vendor's inventory
    inv_items = list(_db.COLS["inventory"].find({"vendor_id": vendor_id}))
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
        pred_res = _db.COLS["predictions"].insert_one({
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

        _db.COLS["feature_snapshots"].insert_one({
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
    order_count = _db.COLS["orders"].count_documents({"vendor_id": vendor_id})
    recent_orders = list(_db.COLS["orders"].find({"vendor_id": vendor_id}).sort("order_date", -1).limit(30))
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


# ==============================================================================
# ROUTE: POST /api/predict-demand
# ------------------------------------------------------------------------------
# WHAT THIS DOES (WHAT-IF DEMAND SIMULATION API):
#   Allows users to test alternative scenarios (e.g. "What if temperature rises
#   to 38°C and rain is 90% during Diwali?").
#   Takes JSON payload of environmental signals and returns XGBoost prediction
#   along with dispatch recommendation:
#     recommended_dispatch = max(0, predicted_demand + safety_stock - available_stock)
# ==============================================================================
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
        pred_res = _db.COLS["predictions"].insert_one({
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

        _db.COLS["feature_snapshots"].insert_one({
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
