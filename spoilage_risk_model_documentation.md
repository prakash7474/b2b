# Spoilage Risk Model — `spoilage_risk_model.pkl`

## Overview
Classifies a batch currently sitting in a vendor's inventory into a risk tier:
**Low** (fresh) / **Medium** (moderate sell-through, nudge push) / **High**
(near-expiry, discount/priority-sale tag). Matches the risk workflow already
defined in the project's Layer 2 spec (score < 0.3 / 0.3–0.7 / > 0.7).

**Algorithm:** Random Forest Classifier (`class_weight="balanced"`)
**Trained on:** stratified 80/20 split on risk label.

## Bundle contents
`joblib.load("spoilage_risk_model.pkl")` returns a dict:

| Key | Contents |
|---|---|
| `model` | trained `RandomForestClassifier` |
| `features` | ordered list of feature column names the model expects |
| `storage_encoder` | `LabelEncoder` for `storageType` |
| `label_encoder` | `LabelEncoder` for the risk label (`Low`/`Medium`/`High`) |

## Input features

| Feature | Type | Source (MongoDB Atlas) |
|---|---|---|
| `initialPH` | float | `BATCH.initialPH` |
| `hoursSinceManufacture` | float | `now − BATCH.mfgTimestamp` |
| `hasRefrigerator` | 0/1 | `VENDOR.hasRefrigerator` |
| `storageTypeEnc` | encoded category | `VENDOR.storageType` |
| `ambientTemperatureC` | float | `WEATHER_FORECAST.temperatureC` (current, keyed to vendor location) |
| `humidityPct` | float | `WEATHER_FORECAST.humidityPct` |
| `fridgeTemperatureC` | float (-1 if no fridge) | `VENDOR.fridgeTemperatureC` |
| `hoursOnShelf` | float | `now − INVENTORY.receivedAt` |
| `sellThroughRate` | 0–1 | `INVENTORY_MOVEMENT` — sold ÷ (opening stock + receipts) over recent window |
| `effectiveTemperatureExposure` | float | engineered: `fridgeTemp` if `hasRefrigerator` else `ambientTemp`, × `hoursSinceManufacture` |
| `hoursToExpiry` | float | `INVENTORY.expiryAt − now` |
| `volumeKg` | float | `BATCH.volume` |
| `vendorRating` | float | `VENDOR.rating` (Bayesian-smoothed in production; exclude for vendors with too few ratings) |

## Inference

```python
import joblib
import pandas as pd

bundle = joblib.load("spoilage_risk_model.pkl")

def predict_spoilage_risk(feature_dict):
    row = pd.DataFrame([feature_dict])[bundle["features"]]
    pred = bundle["model"].predict(row)[0]
    return bundle["label_encoder"].inverse_transform([pred])[0]

# storageType must be pre-encoded:
# feature_dict["storageTypeEnc"] = bundle["storage_encoder"].transform(["fridge"])[0]
```

## Building the feature row from MongoDB Atlas (pymongo)

```python
from pymongo import MongoClient
from datetime import datetime

client = MongoClient("<ATLAS_CONNECTION_STRING>")
db = client["b2p_operational"]

def get_batch_context(inventory_id):
    inv = db.inventory.find_one({"_id": inventory_id})
    batch = db.batches.find_one({"_id": inv["batchId"]})
    vendor = db.vendors.find_one({"_id": inv["vendorId"]})
    return inv, batch, vendor

def get_sell_through(vendor_id, product_id, batch_id, since):
    moves = list(db.inventory_movements.find({
        "vendorId": vendor_id, "productId": product_id, "batchId": batch_id,
        "occurredAt": {"$gte": since},
    }))
    sold = sum(-m["quantity"] for m in moves if m["movementType"] == "sale")
    receipts = sum(m["quantity"] for m in moves if m["movementType"] == "receipt")
    opening = receipts if receipts else 1  # avoid divide-by-zero
    return min(1.0, sold / opening)
```

Combine with a live weather lookup for the vendor's `location`, compute
`hoursSinceManufacture`, `hoursOnShelf`, `hoursToExpiry` from the timestamps
above, then call `predict_spoilage_risk()`. Write the result back to
`INVENTORY.freshnessScore` and log the call to `PREDICTION`
(`predictionType: "SPOILAGE_RISK"`) for audit.

## Output interpretation
Returns one of `"Low"`, `"Medium"`, `"High"`:
- **Low** → standard shelf-life tracking, no action.
- **Medium** → trigger a "fresh batch" push nudge to the vendor/app.
- **High** → attach a priority-sale tag or flash-discount trigger.

## Retraining notes
- Synthetic data here uses a simulated risk-score formula weighted toward
  temperature exposure and refrigeration — replace with real lab/sensor
  ground truth (or vendor-reported spoilage incidents) as soon as available.
- `vendorRating` is low-priority — exclude it for new vendors with too few
  ratings rather than imputing a default.
- Retrain once real `INVENTORY_MOVEMENT` history accumulates so
  `sellThroughRate` reflects actual turnover rather than the synthetic
  beta-distribution placeholder.
