"""
══════════════════════════════════════════════════════════════════════════════
📌 SCRIPT: ML MODEL RETRAINING PIPELINE (retrain_models.py)
══════════════════════════════════════════════════════════════════════════════
💡 WHAT THIS SCRIPT DOES (STUDY THIS FOR YOUR VIVA / EVALUATION):
  This Python script trains and exports the two Machine Learning models
  powering the B2P platform:
    1. DEMAND FORECASTING MODEL  -> XGBoost Regressor (predicts units/kg sold)
    2. SPOILAGE RISK MODEL       -> Random Forest Classifier (predicts risk: Low/Medium/High)

📚 DATASETS USED:
  - b2p_demand_forecasting_data.csv : Historical hourly sales, weather, festival indicators, lag features.
  - b2p_spoilage_risk_data.csv      : Temperature logs, pH levels, hours on shelf, and biological spoil labels.

💾 OUTPUT PKL ARTIFACTS GENERATED:
  - demand_forecast_model.pkl       : Bundles the trained XGBoost model + encoders + feature list.
  - spoilage_risk_model.pkl         : Bundles the trained Random Forest model + encoders + feature list.

🚀 HOW TO RUN:
  python retrain_models.py
══════════════════════════════════════════════════════════════════════════════
"""

# ── 1. IMPORT REQUIRED LIBRARIES ─────────────────────────────────────────────
import pandas as pd                      # DataFrame manipulation & CSV reading
import numpy as np                       # Numerical calculations & array math
import joblib                            # Serializing / saving trained models to .pkl files
from sklearn.preprocessing import LabelEncoder       # Converts categorical text (e.g. "Tier-1") to numbers (0, 1)
from sklearn.model_selection import train_test_split # Splits dataset into training and testing portions
from sklearn.ensemble import RandomForestClassifier  # Ensemble of decision trees for classification
from sklearn.metrics import classification_report, mean_absolute_error # Performance evaluation metrics
import xgboost as xgb                    # Gradient boosted decision trees library for regression

# ══════════════════════════════════════════════════════════════════════════════
# 🎯 MODEL 1: DEMAND FORECASTING (XGBoost Regressor)
# ══════════════════════════════════════════════════════════════════════════════
# 💡 WHAT THIS MODEL DOES:
#    Given a shop's locality, today's weather, day of the week, and past 7 days of sales,
#    it predicts EXACTLY how many kilograms of fresh batter the shop will sell in the next shift.
#
# 💡 WHY XGBOOST (Extreme Gradient Boosting)?
#    - Supervised regression algorithm using an ensemble of shallow decision trees.
#    - Trees are trained sequentially; each new tree corrects the residual errors of prior trees.
#    - Handles tabular time-series features and nonlinear demand spikes (festivals) far better than linear regression.
# ══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("TRAINING DEMAND FORECAST MODEL")
print("=" * 60)

# Step 1: Read historical sales data from CSV file
# Each row represents a time window (e.g., morning breakfast shift 6 AM - 10 AM)
demand_df = pd.read_csv("b2p_demand_forecasting_data.csv")
print(f"Loaded {len(demand_df)} rows for demand forecasting")
print(f"Columns: {list(demand_df.columns)}")

# ── Step 1A: Encode Categorical Features into Numeric Values ──────────────────
# Machine learning algorithms only compute mathematical dot-products, so text
# categories like "High Street", "Diwali", or "Idli Batter" must be converted to numbers (0, 1, 2...).
# We save each LabelEncoder into the pickle bundle so app.py can convert API requests identically!

# Locality Tier (e.g., "Metro Hub", "Commercial", "Residential") -> (0, 1, 2)
locality_encoder = LabelEncoder()
demand_df["localityTierEnc"] = locality_encoder.fit_transform(demand_df["localityTier"])

# Festival Type (e.g., "None", "Pongal", "Diwali", "Weekend Rush") -> (0, 1, 2)
festival_encoder = LabelEncoder()
demand_df["festivalTypeEnc"] = festival_encoder.fit_transform(demand_df["festivalType"])

# Product ID (e.g., "PRD-IDLI-01", "PRD-DOSA-01") -> (0, 1)
product_encoder = LabelEncoder()
demand_df["productIdEnc"] = product_encoder.fit_transform(demand_df["productId"])

# ── Step 1B: Define Feature Matrix (X) and Target Label (y) ──────────────────
# 💡 EXPLAIN THIS FEATURE ENGINEERING TO THE INSTRUCTOR:
#  - Cyclical Time (hourSin, hourCos): Hours 23:00 and 00:00 are adjacent in real life.
#    Using standard numbers (0, 1, ..., 23) makes 23 and 0 look far apart.
#    Trigonometric encoding (sin(2π * hour / 24) and cos(2π * hour / 24)) preserves cyclical circularity!
#  - Cyclical Weekday (weekdaySin, weekdayCos): Same circular logic for Monday through Sunday.
#  - Calendar Signals (isWeekend, isFestivalWindow): South Indian batter demand increases by 40-75% on weekends.
#  - Weather Factors (forecastTemperatureC, forecastRainProbability): Heavy rain reduces footfall.
#  - Historical Lags (lag1, lag7):
#      lag1: Sales from yesterday at the same time.
#      lag7: Sales from exactly 7 days ago (captures weekly periodicity).
#  - Moving Window Stats (rolling7DayMean, rolling7DayStd, sameSlot4WeekMean, recentTrend):
#      Smooths out random daily noise and captures shop growth trends.
demand_features = [
    "hourSin", "hourCos", "weekdaySin", "weekdayCos",
    "isWeekend", "isFestivalWindow", "forecastTemperatureC",
    "forecastRainProbability", "lag1", "lag7",
    "rolling7DayMean", "rolling7DayStd", "sameSlot4WeekMean",
    "recentTrend", "localityTierEnc", "hotspotDensityScore", "productIdEnc"
]

X_demand = demand_df[demand_features]
y_demand = demand_df["unitsSoldNextWindow"]  # 🎯 Target variable: Kilograms of batter demanded

# ── Step 1C: Chronological Train / Test Split (CRITICAL THEORY QUESTION) ─────
# 💡 WHY NOT RANDOM SHUFFLE SPLIT FOR DEMAND FORECASTING?
#    In real-world business, we forecast the FUTURE using data from the PAST.
#    If we randomly shuffled time-series data, future rows would leak into the training set
#    ("data leakage" / look-ahead bias). Thus, we take the first 80% chronologically for training
#    and reserve the final 20% future period strictly for testing.
split_idx = int(len(demand_df) * 0.8)
X_train_d, X_test_d = X_demand.iloc[:split_idx], X_demand.iloc[split_idx:]
y_train_d, y_test_d = y_demand.iloc[:split_idx], y_demand.iloc[split_idx:]

# ── Step 1D: Train the XGBoost Regressor ──────────────────────────────────────
# 👉 CHANGE HERE IF INSTRUCTOR ASKS YOU TO TWEAK MODEL HYPERPARAMETERS:
#    - objective="reg:squarederror": Minimizes Mean Squared Error (MSE) during tree splits.
#    - n_estimators=200: Number of sequential decision trees to build (boosting iterations).
#    - max_depth=6: Maximum depth of each tree; prevents overfitting to noise.
#    - learning_rate=0.1: Shrinkage factor applied to each tree step; smaller = more robust generalization.
#    - subsample=0.8: Each tree trains on 80% random sample of rows (reduces variance).
#    - colsample_bytree=0.8: Each tree uses 80% random sample of features.
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

# ── Step 1E: Evaluate Model Performance (MAE) ────────────────────────────────
# MAE (Mean Absolute Error): Average difference in kg between predicted sales and actual sales.
# Formula: MAE = (1/n) * Σ |y_actual - y_predicted|
y_pred_d = demand_model.predict(X_test_d)
mae = mean_absolute_error(y_test_d, y_pred_d)
print(f"  MAE (Mean Absolute Error): {mae:.2f} kg")

# ── Step 1F: Save Model & Preprocessors as Pickle Bundle ─────────────────────
# We bundle the model with its encoders into a single dictionary and save with joblib.
# When app.py runs inference, it unpickles this dictionary and uses the encoders to transform raw inputs.
demand_bundle = {
    "model": demand_model,
    "features": demand_features,
    "locality_encoder": locality_encoder,
    "festival_encoder": festival_encoder,
    "product_encoder": product_encoder,
}
joblib.dump(demand_bundle, "demand_forecast_model.pkl")
print("  [OK] Saved demand_forecast_model.pkl")


# ══════════════════════════════════════════════════════════════════════════════
# 🎯 MODEL 2: SPOILAGE RISK CLASSIFICATION (Random Forest Classifier)
# ══════════════════════════════════════════════════════════════════════════════
# 💡 WHAT THIS MODEL DOES:
#    Idli & Dosa batter is a live biological food product fermented by lactic acid bacteria
#    (Leuconostoc mesenteroides) and yeast.
#    If ambient temperature is too high, or the tub stays too long on the shelf, acidity rises (pH drops).
#    Once pH drops below 4.0, batter becomes excessively sour and is unsafe to serve.
#
# 💡 WHY RANDOM FOREST CLASSIFIER?
#    - An ensemble (bagging) of hundreds of de-correlated decision trees.
#    - Output is the consensus probability vote across all trees.
#    - Extremely stable against sensor noise (e.g. slight temperature variations).
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("TRAINING SPOILAGE RISK MODEL")
print("=" * 60)

# Step 1: Read storage logs and biological quality data
spoilage_df = pd.read_csv("b2p_spoilage_risk_data.csv")
print(f"Loaded {len(spoilage_df)} rows for spoilage risk")
print(f"Columns: {list(spoilage_df.columns)}")

# ── Step 2A: Encode Storage Types & Risk Classes ─────────────────────────────
# Storage Type (e.g., "Cold Room", "Insulated Box", "Open Counter") -> (0, 1, 2)
storage_encoder = LabelEncoder()
spoilage_df["storageTypeEnc"] = storage_encoder.fit_transform(spoilage_df["storageType"])

# Target Classes: "Low", "Medium", "High" -> (0, 1, 2)
label_encoder = LabelEncoder()
spoilage_df["riskLabelEnc"] = label_encoder.fit_transform(spoilage_df["riskLabel"])

# ── Step 2B: Define Spoilage Environmental Features ──────────────────────────
# Key Biological & Physical Factors:
#  - initialPH: Acidity at milling. Fresh batter = ~4.4 - 4.6. Over-fermented = < 4.0.
#  - hoursSinceManufacture: Total age of the batch since grinder milling.
#  - hasRefrigerator (0 or 1): Whether vendor keeps batter in cold fridge.
#  - ambientTemperatureC & humidityPct: High heat (>32°C) accelerates fermentation tenfold.
#  - hoursOnShelf: Time batch has been open at the shop counter.
#  - sellThroughRate: How fast customers buy it. Higher rate = batch finishes before it can spoil!
#  - effectiveTemperatureExposure: Integrated heat exposure over transit.
spoilage_features = [
    "initialPH", "hoursSinceManufacture", "hasRefrigerator",
    "storageTypeEnc", "ambientTemperatureC", "humidityPct",
    "fridgeTemperatureC", "hoursOnShelf", "sellThroughRate",
    "effectiveTemperatureExposure", "hoursToExpiry", "volumeKg",
    "vendorRating"
]

X_spoil = spoilage_df[spoilage_features]
y_spoil = spoilage_df["riskLabelEnc"]  # 🎯 Target class (0=Low, 1=Medium, 2=High)

# ── Step 2C: Stratified Train / Test Split ───────────────────────────────────
# 💡 WHY STRATIFIED SPLIT HERE?
#    Unlike time-series demand, spoilage events are classification labels.
#    Since "High Risk" batches are relatively rare in a good supply chain (e.g. only 8% of data),
#    `stratify=y_spoil` guarantees that both training (80%) and testing (20%) sets contain
#    the exact same proportion of Low, Medium, and High risk samples!
X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(
    X_spoil, y_spoil, test_size=0.2, stratify=y_spoil, random_state=42
)

# ── Step 2D: Train Random Forest Classifier ──────────────────────────────────
# 👉 CHANGE HERE IF INSTRUCTOR ASKS YOU TO TWEAK RANDOM FOREST HYPERPARAMETERS:
#    - n_estimators=200: Constructs 200 independent bootstrap decision trees.
#    - max_depth=10: Caps the tree depth to prevent memorizing outlier samples (overfitting).
#    - class_weight="balanced": Automatically increases penalty weights for the rarer "High" class,
#      ensuring the model doesn't ignore dangerous spoiled batches!
spoilage_model = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    class_weight="balanced",
    random_state=42
)
spoilage_model.fit(X_train_s, y_train_s)

# ── Step 2E: Evaluate with Classification Report ─────────────────────────────
# Computes Precision, Recall, and F1-Score for each class:
#   - Precision: Out of all batches predicted as High Risk, how many actually were spoiled?
#   - Recall: Out of all truly spoiled batches, how many did the model successfully catch?
#   - F1-Score: Harmonic mean of Precision and Recall (2 * (P * R) / (P + R)).
y_pred_s = spoilage_model.predict(X_test_s)
print(classification_report(y_test_s, y_pred_s, target_names=label_encoder.classes_))

# ── Step 2F: Save Spoilage Model Bundle ──────────────────────────────────────
spoilage_bundle = {
    "model": spoilage_model,
    "features": spoilage_features,
    "storage_encoder": storage_encoder,
    "label_encoder": label_encoder,
}
joblib.dump(spoilage_bundle, "spoilage_risk_model.pkl")
print("  [OK] Saved spoilage_risk_model.pkl")

print("\n[DONE] Both models retrained and saved successfully!")

