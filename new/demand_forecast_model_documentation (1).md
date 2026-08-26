# Demand Forecasting Model — `demand_forecast_model.pkl`

## Overview
Predicts `unitsSoldNextWindow` per `vendorId × productId × dispatchWindow`
(morning 05:00–11:00 / evening 15:00–21:00). Feeds the dispatch calculator:

```
recommendedDispatch = max(0, predictedDemand + safetyStock - availableStock)
```

**Algorithm:** XGBoost Regressor (`reg:squarederror`)
**Trained on:** chronological split (train < cutoff date, test ≥ cutoff) — never random, to avoid leaking future seasonal patterns.

## Bundle contents
`joblib.load("demand_forecast_model.pkl")` returns a dict:

| Key | Contents |
|---|---|
| `model` | trained `XGBRegressor` |
| `features` | ordered list of feature column names the model expects |
| `locality_encoder` | `LabelEncoder` for `localityTier` |
| `festival_encoder` | `LabelEncoder` for `festivalType` |
| `product_encoder` | `LabelEncoder` for `productId` |

## Input features

| Feature | Type | Source (MongoDB Atlas) |
|---|---|---|
| `hourSin`, `hourCos` | float | derived from dispatch window start hour |
| `weekdaySin`, `weekdayCos` | float | derived from `date` |
| `isWeekend` | 0/1 | derived from `date` |
| `isFestivalWindow` | 0/1 | `FESTIVAL_CALENDAR.date` lookup |
| `festivalTypeEnc` | encoded category | `FESTIVAL_CALENDAR.festivalType` |
| `forecastTemperatureC` | float | `WEATHER_FORECAST.temperatureC` (forecast *issued at* prediction time — never actual weather) |
| `forecastRainProbability` | 0–1 | `WEATHER_FORECAST.rainProbability` |
| `lag1` | float | `INVENTORY_MOVEMENT` — units sold, previous comparable window |
| `lag7` | float | `INVENTORY_MOVEMENT` — units sold, same window 7 days ago |
| `sameSlot4WeekMean` | float | `INVENTORY_MOVEMENT` aggregation, trailing 4 weeks, same slot |
| `rolling7DayMean`, `rolling7DayStd` | float | `INVENTORY_MOVEMENT` aggregation, trailing 7 days (excludes current window) |
| `recentTrend` | float | rolling7DayMean ÷ rolling28DayMean |
| `localityTierEnc` | encoded category | `VENDOR.localityTier` |
| `hotspotDensityScore` | float | `VENDOR.hotspotDensityScore` (cached, recomputed periodically) |
| `productIdEnc` | encoded category | `PRODUCT._id` / name |

All lag/rolling features must be computed with `shift(1)` **before** any rolling window — this prevents the current window's own sales from leaking into its own prediction.

## Inference

```python
import joblib
import pandas as pd

bundle = joblib.load("demand_forecast_model.pkl")

def predict_demand(feature_dict):
    row = pd.DataFrame([feature_dict])[bundle["features"]]
    return bundle["model"].predict(row)[0]

# feature_dict keys must match bundle["features"] exactly, with
# localityTier/festivalType/productId already passed through the
# matching bundle[...]_encoder.transform([...])[0] before this call.
```

## Building the feature row from MongoDB Atlas (pymongo)

```python
from pymongo import MongoClient
from datetime import datetime, timedelta

client = MongoClient("<ATLAS_CONNECTION_STRING>")
db = client["b2p_analytics"]

def get_recent_sales(vendor_id, product_id, window, as_of):
    cutoff = as_of - timedelta(days=28)
    cursor = db.inventory_movements.find({
        "vendorId": vendor_id,
        "productId": product_id,
        "movementType": "sale",
        "occurredAt": {"$gte": cutoff, "$lt": as_of},
    }).sort("occurredAt", 1)
    return list(cursor)

def get_forecast_weather(location_grid_key, forecast_for):
    return db.weather_forecasts.find_one({
        "locationGridKey": location_grid_key,
        "forecastFor": forecast_for,
    }, sort=[("forecastIssuedAt", -1)])

def get_festival_flag(target_date):
    return db.festival_calendar.find_one({"date": target_date})
```

Aggregate `get_recent_sales()` into `lag1`, `lag7`, `rolling7DayMean`, etc. in your
FastAPI feature-pipeline service before calling `predict_demand()`. Write the
result to `PREDICTION` (`predictionType: "DEMAND"`) for audit/evaluation.

## Output interpretation
Returns a single float — predicted units for that vendor/product/window.
This is **demand**, not dispatch quantity — apply the dispatch formula above
(with `availableStock` from `INVENTORY.quantity` and a chosen `safetyStock`)
before sending a restock recommendation.

## Retraining notes
- Re-run once 8–12 weeks of clean transaction data exist; synthetic data is
  a placeholder for the demo only.
- Always validate on the most recent chronological slice — never shuffle
  train/test.
- Track MAE and WAPE against a same-slot-4-week-average baseline; only ship
  a retrained model if it beats the baseline.
