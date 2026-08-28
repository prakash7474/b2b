"""
Retrain demand and spoilage models from CSV data.
Ensures compatibility with the current XGBoost/sklearn versions.
"""

import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import xgboost as xgb

# ═══════════════════════════════════════════════════════════════════
# 1. DEMAND FORECASTING MODEL (XGBoost)
# ═══════════════════════════════════════════════════════════════════
print("=" * 60)
print("TRAINING DEMAND FORECAST MODEL")
print("=" * 60)

demand_df = pd.read_csv("b2p_demand_forecasting_data.csv")
print(f"Loaded {len(demand_df)} rows for demand forecasting")
print(f"Columns: {list(demand_df.columns)}")

# Encode categorical features
locality_encoder = LabelEncoder()
demand_df["localityTierEnc"] = locality_encoder.fit_transform(demand_df["localityTier"])

festival_encoder = LabelEncoder()
demand_df["festivalTypeEnc"] = festival_encoder.fit_transform(demand_df["festivalType"])

product_encoder = LabelEncoder()
demand_df["productIdEnc"] = product_encoder.fit_transform(demand_df["productId"])

# Define features (matching original model's feature list)
demand_features = [
    "hourSin", "hourCos", "weekdaySin", "weekdayCos",
    "isWeekend", "isFestivalWindow", "forecastTemperatureC",
    "forecastRainProbability", "lag1", "lag7",
    "rolling7DayMean", "rolling7DayStd", "sameSlot4WeekMean",
    "recentTrend", "localityTierEnc", "hotspotDensityScore", "productIdEnc"
]

X_demand = demand_df[demand_features]
y_demand = demand_df["unitsSoldNextWindow"]

# Chronological split (no shuffle for time series)
split_idx = int(len(demand_df) * 0.8)
X_train_d, X_test_d = X_demand.iloc[:split_idx], X_demand.iloc[split_idx:]
y_train_d, y_test_d = y_demand.iloc[:split_idx], y_demand.iloc[split_idx:]

# Train XGBoost
demand_model = xgb.XGBRegressor(
    objective="reg:squarederror",
    n_estimators=200,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42
)
demand_model.fit(X_train_d, y_train_d)

# Evaluate
from sklearn.metrics import mean_absolute_error
y_pred_d = demand_model.predict(X_test_d)
mae = mean_absolute_error(y_test_d, y_pred_d)
print(f"  MAE: {mae:.2f}")

# Save bundle
demand_bundle = {
    "model": demand_model,
    "features": demand_features,
    "locality_encoder": locality_encoder,
    "festival_encoder": festival_encoder,
    "product_encoder": product_encoder,
}
joblib.dump(demand_bundle, "demand_forecast_model.pkl")
print("  [OK] Saved demand_forecast_model.pkl")


# ═══════════════════════════════════════════════════════════════════
# 2. SPOILAGE RISK MODEL (Random Forest)
# ═══════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("TRAINING SPOILAGE RISK MODEL")
print("=" * 60)

spoilage_df = pd.read_csv("b2p_spoilage_risk_data.csv")
print(f"Loaded {len(spoilage_df)} rows for spoilage risk")
print(f"Columns: {list(spoilage_df.columns)}")

# Encode categorical features
storage_encoder = LabelEncoder()
spoilage_df["storageTypeEnc"] = storage_encoder.fit_transform(spoilage_df["storageType"])

label_encoder = LabelEncoder()
spoilage_df["riskLabelEnc"] = label_encoder.fit_transform(spoilage_df["riskLabel"])

# Define features (matching original model's feature list)
spoilage_features = [
    "initialPH", "hoursSinceManufacture", "hasRefrigerator",
    "storageTypeEnc", "ambientTemperatureC", "humidityPct",
    "fridgeTemperatureC", "hoursOnShelf", "sellThroughRate",
    "effectiveTemperatureExposure", "hoursToExpiry", "volumeKg",
    "vendorRating"
]

X_spoil = spoilage_df[spoilage_features]
y_spoil = spoilage_df["riskLabelEnc"]

# Stratified split
X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(
    X_spoil, y_spoil, test_size=0.2, stratify=y_spoil, random_state=42
)

# Train Random Forest
spoilage_model = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    class_weight="balanced",
    random_state=42
)
spoilage_model.fit(X_train_s, y_train_s)

# Evaluate
y_pred_s = spoilage_model.predict(X_test_s)
print(classification_report(y_test_s, y_pred_s, target_names=label_encoder.classes_))

# Save bundle
spoilage_bundle = {
    "model": spoilage_model,
    "features": spoilage_features,
    "storage_encoder": storage_encoder,
    "label_encoder": label_encoder,
}
joblib.dump(spoilage_bundle, "spoilage_risk_model.pkl")
print("  [OK] Saved spoilage_risk_model.pkl")

print("\n[DONE] Both models retrained and saved successfully!")
