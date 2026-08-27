# B2P (Batter-to-Plate) — ML Prediction Platform

> A full-stack ML-powered platform for predicting demand and spoilage risk for fresh batter products (Idli, Dosa, Combo Pack) sold through small vendors.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Database Schema](#4-database-schema)
5. [ML Models](#5-ml-models)
6. [Applications](#6-applications)
7. [API Reference](#7-api-reference)
8. [Data Flow](#8-data-flow)
9. [Setup & Installation](#9-setup--installation)
10. [Retraining Models](#10-retraining-models)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Project Overview

### Problem
Small food vendors selling fresh batter (Idli, Dosa) face two critical challenges:
- **Overstocking** → spoilage, waste, financial loss
- **Understocking** → lost sales, unhappy customers

### Solution
An ML-powered platform that provides:
- **Demand Forecasting** — Predict how many units a vendor will sell in the next time window
- **Spoilage Risk Classification** — Classify batches as Low / Medium / High risk
- **Dispatch Recommendations** — Calculate optimal restock quantities
- **Admin Dashboard** — Monitor vendors, inventory, orders, alerts, and ML predictions

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JavaScript (SPA) |
| Backend | Python Flask |
| Database | MongoDB Atlas |
| ML Models | XGBoost (demand), Random Forest (spoilage) |
| Serialization | joblib (pickle) |
| Data Processing | pandas, NumPy |
| ML Framework | scikit-learn, XGBoost |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        B2P PLATFORM                                 │
│                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────┐        │
│  │  Admin Panel          │          │  ML Dashboard         │        │
│  │  (new/admin/)         │          │  (new/)               │        │
│  │  Flask :5001          │          │  Flask :5000          │        │
│  │                       │          │                       │        │
│  │  ┌─────────────────┐ │          │  ┌─────────────────┐ │        │
│  │  │ UI: index.html  │ │          │  │ UI: index.html  │ │        │
│  │  │ - Dashboard     │ │          │  │ - Manage Data   │ │        │
│  │  │ - Vendors       │ │          │  │ - Demand Form   │ │        │
│  │  │ - Orders        │ │          │  │ - Spoilage Form │ │        │
│  │  │ - Inventory     │ │          │  │ - History       │ │        │
│  │  │ - Alerts        │ │          │  └─────────────────┘ │        │
│  │  │ - AI Predictions│ │          │                       │        │
│  │  │ - Recommendations│ │          │  ┌─────────────────┐ │        │
│  │  └─────────────────┘ │          │  │ admin_app.py    │ │        │
│  │                       │          │  │ (app.py)        │ │        │
│  │  ┌─────────────────┐ │          │  └─────────────────┘ │        │
│  │  │ admin_app.py    │ │          └──────────┬────────────┘        │
│  │  └────────┬────────┘ │                     │                     │
│  └───────────┼──────────┘                     │                     │
│              │                                │                     │
│              ▼                                ▼                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │                   MongoDB Atlas                            │     │
│  │                                                           │     │
│  │  Database: b2p_admin          Database: b2p_ml           │     │
│  │  ├─ vendors                   ├─ vendors                  │     │
│  │  ├─ products                  ├─ products                 │     │
│  │  ├─ inventory                 ├─ batches                  │     │
│  │  ├─ orders                    └─ predictions              │     │
│  │  ├─ order_items                                            │     │
│  │  ├─ inventory_alerts                                       │     │
│  │  └─ vendor_recommendations                                 │     │
│  └───────────────────────────────────────────────────────────┘     │
│              ▲                                                      │
│              │                                                      │
│  ┌───────────┴──────────┐                                          │
│  │  ML Models           │                                          │
│  │  (new/*.pkl)         │                                          │
│  │  ├─ demand_forecast_model.pkl   (XGBoost)                      │
│  │  └─ spoilage_risk_model.pkl    (Random Forest)                 │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Differences Between the Two Apps

| Aspect | Admin Panel (:5001) | ML Dashboard (:5000) |
|--------|--------------------|--------------------|
| **Purpose** | Operations monitoring | ML experimentation |
| **Database** | `b2p_admin` | `b2p_ml` |
| **ML Trigger** | Auto-derived from DB | User-controlled form |
| **Predictions Stored?** | ❌ No (on-the-fly) | ✅ Yes → `predictions` |
| **CRUD Operations** | Vendor verify/reject only | Full CRUD (Vendors, Products, Batches) |
| **Prediction History** | ❌ None | ✅ Full history table |
| **Data Input** | Read from DB | Manual form + DB seed |

---

## 3. File Structure

```
new/
├── app.py                              # ML Dashboard backend (port 5000)
├── static/
│   └── index.html                      # ML Dashboard frontend
│
├── admin/
│   ├── admin_app.py                    # Admin Panel backend (port 5001)
│   ├── static/
│   │   └── index.html                  # Admin Panel frontend
│   ├── seed_data.py                    # Admin panel seed script
│   └── README.md                       # Admin panel docs
│
├── demand_forecast_model.pkl           # XGBoost demand model bundle
├── spoilage_risk_model.pkl             # Random Forest spoilage model bundle
├── retrain_models.py                   # Script to retrain both models
│
├── b2p_demand_forecasting_data.csv     # Training data for demand model
├── b2p_spoilage_risk_data.csv          # Training data for spoilage model
│
├── demand_forecast_model_documentation.md   # Demand model docs
├── spoilage_risk_model_documentation.md     # Spoilage model docs
├── DOCUMENTATION.md                   # ← This file
│
└── requirements.txt                    # Python dependencies
```

---

## 4. Database Schema

### Database: `b2p_admin` (Admin Panel)

#### `vendors`
```json
{
  "vendor_id": "V100",
  "shop_name": "Lakshmi Idli Shop",
  "owner_name": "Lakshmi",
  "phone": "+91-9876543210",
  "email": "lakshmi@shop.com",
  "address": "123 Main St, Chennai",
  "latitude": 13.0827,
  "longitude": 80.2707,
  "rating": 4.2,
  "rating_count": 45,
  "fssai_number": "12345678901234",
  "verification_status": "verified" | "pending" | "rejected",
  "localityTier": "residential_budget",
  "hotspotDensityScore": 33
}
```

#### `inventory`
```json
{
  "inventory_id": "INV100",
  "vendor_id": "V100",
  "product_name": "Idli Batter",
  "batch_number": "B20000",
  "quantity": 15,
  "minimum_stock": 5,
  "price": 40,
  "manufacture_date": "2026-02-27T06:00:00",
  "expiry_date": "2026-02-28T06:00:00",
  "received_at": "2026-02-27T08:00:00",
  "freshness_score": 0.85
}
```

#### `orders`
```json
{
  "order_id": "ORD100",
  "user_id": "U200",
  "vendor_id": "V100",
  "order_date": "2026-02-27T09:30:00",
  "total_amount": 120,
  "payment_status": "paid",
  "payment_method": "UPI",
  "order_status": "delivered",
  "delivery_type": "delivery",
  "delivery_address": "456 Park Lane, Chennai"
}
```

#### `order_items`
```json
{
  "order_id": "ORD100",
  "inventory_id": "INV100",
  "quantity": 3,
  "unit_price": 40,
  "subtotal": 120
}
```

#### `inventory_alerts`
```json
{
  "alert_id": "ALT100",
  "inventory_id": "INV100",
  "alert_type": "low_stock" | "spoilage_risk" | "expiry_warning",
  "alert_message": "Stock below minimum level",
  "alert_status": "active" | "acknowledged" | "resolved",
  "generated_time": "2026-02-27T10:00:00"
}
```

#### `vendor_recommendations`
```json
{
  "recommendation_rank": 1,
  "vendor_id": "V100",
  "distance": 2.5,
  "stock_score": 0.85,
  "freshness_score": 0.92,
  "rating_score": 0.88
}
```

---

### Database: `b2p_ml` (ML Dashboard)

#### `vendors`
```json
{
  "vendorId": "V100",
  "shopName": "Lakshmi Idli Shop",
  "localityTier": "residential_budget",
  "hotspotDensityScore": 33,
  "hasRefrigerator": true,
  "storageType": "fridge",
  "fridgeTemperatureC": 4.9,
  "rating": 4.2,
  "createdAt": "2026-02-26T00:00:00Z"
}
```

#### `products`
```json
{
  "productId": "Idly_Batter",
  "name": "Idly Batter",
  "category": "batter",
  "unitType": "kg",
  "shelfLifeHoursAmbient": 24,
  "shelfLifeHoursFridge": 72,
  "createdAt": "2026-02-26T00:00:00Z"
}
```

#### `batches`
```json
{
  "batchId": "B20000",
  "productId": "Idly_Batter",
  "vendorId": "V100",
  "manufacturerId": "MFG001",
  "batchNumber": "B20000",
  "mfgTimestamp": "2026-02-27T06:00:00Z",
  "volume": 1.0,
  "initialPH": 4.4,
  "createdAt": "2026-02-26T00:00:00Z"
}
```

#### `predictions` (ML write — only in `b2p_ml`)
```json
{
  "_id": "ObjectId(...)",
  "predictionType": "DEMAND" | "SPOILAGE_RISK",
  "vendorId": "V100",
  "productId": "Idly_Batter",
  "date": "2026-03-01T00:00:00Z",
  "window": "morning",
  "batchId": "B20000",
  "predictedValue": 23.5,
  "recommendedDispatch": 8.5,
  "confidence": 79.6,
  "inputFeatures": { ... },
  "modelVersion": "v1.0",
  "generatedAt": "2026-02-26T12:00:00Z"
}
```

---

## 5. ML Models

### 5.1 Demand Forecasting Model

**File:** `demand_forecast_model.pkl`

| Property | Value |
|----------|-------|
| **Algorithm** | XGBoost Regressor (`reg:squarederror`) |
| **Target** | `unitsSoldNextWindow` |
| **Training Split** | Chronological 80/20 (no shuffle) |
| **Metric** | MAE (Mean Absolute Error) |

#### Bundle Contents
```python
demand_bundle = {
    "model":            XGBRegressor,      # trained model
    "features":         list[str],         # 17 feature names (ordered)
    "locality_encoder": LabelEncoder,      # encodes localityTier
    "festival_encoder": LabelEncoder,      # encodes festivalType
    "product_encoder":  LabelEncoder,      # encodes productId
}
```

#### Input Features (17)

| # | Feature | Type | Description |
|---|---------|------|-------------|
| 1 | `hourSin` | float | sin(2π × hour / 24) |
| 2 | `hourCos` | float | cos(2π × hour / 24) |
| 3 | `weekdaySin` | float | sin(2π × weekday / 7) |
| 4 | `weekdayCos` | float | cos(2π × weekday / 7) |
| 5 | `isWeekend` | 0/1 | 1 if Saturday/Sunday |
| 6 | `isFestivalWindow` | 0/1 | 1 if festival period |
| 7 | `forecastTemperatureC` | float | Weather forecast temperature |
| 8 | `forecastRainProbability` | float | 0–1 rain probability |
| 9 | `lag1` | float | Units sold, previous comparable window |
| 10 | `lag7` | float | Units sold, same window 7 days ago |
| 11 | `rolling7DayMean` | float | Mean sales trailing 7 days |
| 12 | `rolling7DayStd` | float | Std dev sales trailing 7 days |
| 13 | `sameSlot4WeekMean` | float | Mean sales, same slot, trailing 4 weeks |
| 14 | `recentTrend` | float | rolling7DayMean / rolling28DayMean |
| 15 | `localityTierEnc` | int | Encoded locality tier |
| 16 | `hotspotDensityScore` | float | Vendor area hotspot density |
| 17 | `productIdEnc` | int | Encoded product ID |

#### Output
- Single float: predicted units for that vendor/product/window
- Dispatch formula: `recommendedDispatch = max(0, predictedDemand + safetyStock - availableStock)`

---

### 5.2 Spoilage Risk Model

**File:** `spoilage_risk_model.pkl`

| Property | Value |
|----------|-------|
| **Algorithm** | Random Forest Classifier (`class_weight="balanced"`) |
| **Target** | Risk label: Low / Medium / High |
| **Training Split** | Stratified 80/20 |
| **Metric** | Classification Report (precision, recall, F1) |

#### Bundle Contents
```python
spoilage_bundle = {
    "model":           RandomForestClassifier,  # trained model
    "features":        list[str],               # 13 feature names (ordered)
    "storage_encoder": LabelEncoder,            # encodes storageType
    "label_encoder":   LabelEncoder,            # encodes riskLabel
}
```

#### Input Features (13)

| # | Feature | Type | Description |
|---|---------|------|-------------|
| 1 | `initialPH` | float | pH at manufacture |
| 2 | `hoursSinceManufacture` | float | Hours elapsed since mfg |
| 3 | `hasRefrigerator` | 0/1 | 1 if vendor has fridge |
| 4 | `storageTypeEnc` | int | Encoded storage type |
| 5 | `ambientTemperatureC` | float | Ambient temperature |
| 6 | `humidityPct` | float | Humidity percentage |
| 7 | `fridgeTemperatureC` | float | Fridge temp (-1 if no fridge) |
| 8 | `hoursOnShelf` | float | Hours since received at vendor |
| 9 | `sellThroughRate` | float | 0–1 ratio sold/available |
| 10 | `effectiveTemperatureExposure` | float | temp × hoursSinceMfg |
| 11 | `hoursToExpiry` | float | Hours until expiry |
| 12 | `volumeKg` | float | Batch volume in kg |
| 13 | `vendorRating` | float | Vendor rating (0–5) |

#### Output
- Risk label: `"Low"` | `"Medium"` | `"High"`
- Confidence: percentage (max probability)
- Probabilities: `{ "Low": 12.3%, "Medium": 8.1%, "High": 79.6% }`

#### Risk Interpretation
| Risk | Action |
|------|--------|
| **Low** | Standard shelf-life tracking, no action needed |
| **Medium** | Trigger "fresh batch" push nudge to vendor |
| **High** | Attach priority-sale tag or flash-discount |

---

## 6. Applications

### 6.1 ML Dashboard (`app.py` — Port 5000)

**Purpose:** ML experimentation and data management

**Features:**
- Manage Data tab: CRUD for Vendors, Products, Batches
- Demand Forecast tab: 15-field form → ML prediction → stored in DB
- Spoilage Risk tab: 14-field form → ML prediction → stored in DB
- Prediction History: all past predictions from `predictions` collection
- Stats cards: total predictions, demand count, spoilage count

**Key Behavior:**
- Seeds 5 vendors, 3 products, 5 batches on first run
- Every prediction is persisted to the `predictions` collection
- History and stats update automatically after each prediction

### 6.2 Admin Panel (`admin_app.py` — Port 5001)

**Purpose:** Operations monitoring and vendor management

**Features:**
- Dashboard: aggregated stats (vendors, inventory, orders, alerts)
- Vendors: list, detail, verify/reject registration
- Vendor Detail: ML demand forecast (auto-loaded), inventory table, order history
- Orders: filterable list with search, detail modal
- Inventory: list with freshness bars, ML spoilage risk modal
- Alerts: filterable by type and status, enriched with inventory data
- AI Predictions: batch ML runs for all vendors/inventory items
- Recommendations: vendor ranking by distance, stock, freshness, rating

**Key Behavior:**
- Seeds 5 vendors, 10 inventory items, 8 orders, 8 alerts, 7 recommendations on first run
- ML predictions are computed on-the-fly (NOT stored in DB)
- Only write operation: vendor verification (PUT `/api/vendors/<id>/verify`)

---

## 7. API Reference

### 7.1 ML Dashboard API (Port 5000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/vendors` | GET | List all vendors |
| `POST /api/vendors` | POST | Create vendor |
| `DELETE /api/vendors/<vendorId>` | DELETE | Delete vendor |
| `GET /api/products` | GET | List all products |
| `POST /api/products` | POST | Create product |
| `DELETE /api/products/<productId>` | DELETE | Delete product |
| `GET /api/batches` | GET | List all batches |
| `POST /api/batches` | POST | Create batch |
| `DELETE /api/batches/<batchId>` | DELETE | Delete batch |
| `POST /api/predict-demand` | POST | Run demand prediction |
| `POST /api/predict-spoilage` | POST | Run spoilage prediction |
| `GET /api/history` | GET | Prediction history |
| `GET /api/stats` | GET | Prediction statistics |

#### POST `/api/predict-demand`

**Request Body:**
```json
{
  "vendorId": "V100",
  "productId": "Idly_Batter",
  "date": "2026-03-01",
  "window": "morning",
  "temperature": 31,
  "rainProbability": 0.2,
  "localityTier": "residential_budget",
  "festivalType": "none",
  "hotspotDensityScore": 33,
  "availableStock": 20,
  "safetyStock": 5,
  "lag1": 18,
  "lag7": 17,
  "rolling7DayMean": 19,
  "rolling7DayStd": 4,
  "sameSlot4WeekMean": 21
}
```

**Response:**
```json
{
  "predictedDemand": 23.5,
  "recommendedDispatch": 8.5,
  "vendorId": "V100",
  "productId": "Idly_Batter",
  "date": "2026-03-01",
  "window": "morning",
  "features": { ... }
}
```

#### POST `/api/predict-spoilage`

**Request Body:**
```json
{
  "vendorId": "V100",
  "batchId": "B20000",
  "productId": "Idly_Batter",
  "initialPH": 4.4,
  "hoursSinceManufacture": 48,
  "hasRefrigerator": 1,
  "storageType": "fridge",
  "ambientTemperatureC": 32,
  "humidityPct": 65,
  "fridgeTemperatureC": 5,
  "hoursOnShelf": 24,
  "sellThroughRate": 0.5,
  "hoursToExpiry": 120,
  "volumeKg": 1,
  "vendorRating": 4.0
}
```

**Response:**
```json
{
  "riskLabel": "High",
  "confidence": 79.6,
  "probabilities": { "Low": 12.3, "Medium": 8.1, "High": 79.6 },
  "vendorId": "V100",
  "batchId": "B20000",
  "productId": "Idly_Batter",
  "features": { ... }
}
```

---

### 7.2 Admin Panel API (Port 5001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/dashboard` | GET | Aggregated stats |
| `GET /api/vendors` | GET | List all vendors |
| `GET /api/vendors/<vendor_id>` | GET | Vendor detail |
| `GET /api/vendors/<vendor_id>/inventory` | GET | Vendor's inventory |
| `GET /api/vendors/<vendor_id>/orders` | GET | Vendor's delivery orders |
| `PUT /api/vendors/<vendor_id>/verify` | PUT | Verify/reject vendor |
| `GET /api/vendors/<vendor_id>/demand-forecast` | GET | ML demand prediction |
| `GET /api/inventory` | GET | List all inventory |
| `GET /api/inventory/<inventory_id>` | GET | Inventory item detail |
| `GET /api/inventory/<inventory_id>/spoilage-risk` | GET | ML spoilage risk |
| `GET /api/orders` | GET | List orders (filterable) |
| `GET /api/orders/<order_id>` | GET | Order with items |
| `GET /api/alerts` | GET | Inventory alerts |
| `GET /api/recommendations` | GET | Vendor recommendations |

#### PUT `/api/vendors/<vendor_id>/verify`

**Request Body:**
```json
{ "action": "verify" }
```
or
```json
{ "action": "reject" }
```

**Response:**
```json
{
  "ok": true,
  "vendorId": "V100",
  "status": "verified"
}
```

#### GET `/api/orders` (filterable)

**Query Parameters:**
| Param | Example | Description |
|-------|---------|-------------|
| `vendor_id` | `V100` | Filter by vendor |
| `order_status` | `pending` | Filter by status |
| `payment_status` | `paid` | Filter by payment |
| `search` | `ORD100` | Regex search on order_id, user_id, delivery_address |

#### GET `/api/alerts` (filterable)

**Query Parameters:**
| Param | Example | Description |
|-------|---------|-------------|
| `alert_type` | `low_stock` | Filter by type |
| `alert_status` | `active` | Filter by status |

---

## 8. Data Flow

### 8.1 Demand Forecast Flow (Admin Panel)

```
User opens Vendor Detail Page
  │
  ▼
Frontend: loadVendorDetail(vendorId)
  │
  ├─ GET /api/vendors/<id>/inventory    → DB read: inventory collection
  ├─ GET /api/vendors/<id>/orders       → DB read: orders collection
  ├─ GET /api/vendors/<id>/demand-forecast  → ⚡ ML
  │
  ▼
Backend: demand_forecast(vendorId)
  │
  ├─ DB READ: vendors {vendor_id} → shop_name, localityTier, hotspotDensityScore
  ├─ DB READ: inventory {vendor_id} → sum(quantity) = total_stock
  ├─ DB READ: orders {vendor_id} → count = historical_sales
  │
  ├─ FEATURE ENGINEERING:
  │   ├─ Compute lag1, lag7, rolling7Mean from order history
  │   ├─ Encode localityTier → localityTierEnc
  │   ├─ Encode productId → productIdEnc
  │   └─ Compute time features (hourSin, weekdaySin, etc.)
  │
  ├─ ML INFERENCE:
  │   demand_model.predict(row) → predictedDemand
  │   recommendedDispatch = predictedDemand + 5.0 - total_stock
  │
  └─ RESPONSE: JSON → displayed in "Demand Forecast (ML)" box
```

### 8.2 Spoilage Risk Flow (Admin Panel)

```
User clicks "ML Risk" button on Inventory item
  │
  ▼
Frontend: showSpoilageRisk(inventoryId)
  │
  ▼
GET /api/inventory/<id>/spoilage-risk
  │
  ├─ DB READ: inventory {inventory_id} → dates, quantity, freshness_score
  ├─ DB READ: vendors {vendor_id} → hasRefrigerator, rating
  ├─ DB READ: orders count({vendor_id}) → order_count
  │
  ├─ FEATURE ENGINEERING:
  │   ├─ hoursSinceManufacture = (now - manufacture_date).hours
  │   ├─ hoursToExpiry = (expiry_date - now).hours
  │   ├─ sellThroughRate = orders / (quantity + orders)
  │   ├─ effectiveTempExposure = fridgeTemp × hoursSinceMfg
  │   └─ Encode storageType → storageTypeEnc
  │
  ├─ ML INFERENCE:
  │   spoilage_model.predict(row) → riskLabel
  │   spoilage_model.predict_proba(row) → confidence + probabilities
  │
  └─ RESPONSE: JSON → displayed in modal popup
```

### 8.3 Prediction Storage Flow (ML Dashboard)

```
User fills Demand Forecast form → clicks "Predict Demand"
  │
  ▼
Frontend: predictDemand()
  │ POST /api/predict-demand (15 fields)
  │
  ▼
Backend: predict_demand()
  │
  ├─ Feature engineering from form inputs
  ├─ ML inference: demand_model.predict(row)
  ├─ DB WRITE: predictions_col.insert_one({
  │     predictionType: "DEMAND",
  │     vendorId, productId, date, window,
  │     predictedValue, recommendedDispatch,
  │     inputFeatures: { ... },
  │     modelVersion: "v1.0",
  │     generatedAt: now
  │   })
  │
  ├─ RESPONSE → UI: result box shows predicted demand + dispatch
  ├─ refreshHistory() → GET /api/history → table updates
  └─ refreshStats()  → GET /api/stats   → stat cards update
```

---

## 9. Setup & Installation

### Prerequisites

- Python 3.9+
- MongoDB Atlas account (or local MongoDB)
- pip (Python package manager)

### Step 1: Install Dependencies

```bash
cd new
pip install -r requirements.txt
```

**Requirements:**
```
flask>=3.0
flask-cors>=4.0
pymongo>=4.0
joblib>=1.3
pandas>=2.0
numpy>=1.24
xgboost>=2.0
scikit-learn>=1.3
```

### Step 2: Set Environment Variables

```bash
# Optional — defaults to hardcoded connection string
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"
```

### Step 3: Verify ML Model Files

Ensure these exist in `new/`:
- `demand_forecast_model.pkl`
- `spoilage_risk_model.pkl`

### Step 4: Run the Applications

**ML Dashboard (port 5000):**
```bash
cd new
python app.py
# → http://localhost:5000
```

**Admin Panel (port 5001):**
```bash
cd new/admin
python admin_app.py
# → http://localhost:5001
```

### First Run Behavior

| App | Seed Data |
|-----|-----------|
| ML Dashboard | 5 vendors, 3 products, 5 batches |
| Admin Panel | 5 vendors, 10 inventory items, 8 orders, 8 alerts, 7 recommendations |

---

## 10. Retraining Models

### When to Retrain

- After 8–12 weeks of real transaction data
- When model performance degrades (MAE increases)
- When new products or localities are added

### How to Retrain

```bash
cd new
python retrain_models.py
```

### What It Does

1. **Demand Model:**
   - Reads `b2p_demand_forecasting_data.csv`
   - Encodes categorical features (locality, festival, product)
   - Trains XGBoost with chronological split
   - Saves `demand_forecast_model.pkl`

2. **Spoilage Model:**
   - Reads `b2p_spoilage_risk_data.csv`
   - Encodes storage type and risk labels
   - Trains Random Forest with stratified split
   - Saves `spoilage_risk_model.pkl`

### Validation Guidelines

- Always use chronological split for demand (never shuffle)
- Track MAE against same-slot-4-week-average baseline
- Only ship a retrained model if it beats the baseline
- Replace synthetic data with real lab/sensor ground truth when available

---

## 11. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **MongoDB Connection Error** | Verify `MONGODB_URI` is correct; check firewall allows Atlas access |
| **Model Not Found** | Ensure `.pkl` files are in `new/` directory; run `retrain_models.py` |
| **Port Already in Use** | Change port in `app.run(..., port=XXXX)` or kill the process |
| **Import Error (xgboost)** | Run `pip install xgboost>=2.0` |
| **Empty Dashboard** | First run auto-seeds data; check MongoDB connection |
| **ML Prediction Error** | Ensure feature names match model expectations; check encoder labels |

### Encoder Fallback

The `safe_encode()` function handles unseen labels:
```python
def safe_encode(encoder, value, known_labels):
    if value in known_labels:
        return int(encoder.transform([value])[0])
    return 0  # default fallback for unknown categories
```

### MongoDB Atlas Connection

Default connection string (hardcoded in both apps):
```
mongodb+srv://rioprakash47_db_user:q7ngEz0PZF3L9szJ@cluster0.ziuzjl5.mongodb.net
```

Override with environment variable:
```bash
export MONGODB_URI="mongodb+srv://your-connection-string"
```

---

## Appendix: Training Data

### Demand Forecasting Data (`b2p_demand_forecasting_data.csv`)

Columns include:
- `vendorId`, `productId`, `date`, `window`
- `hourSin`, `hourCos`, `weekdaySin`, `weekdayCos`
- `isWeekend`, `isFestivalWindow`, `festivalType`
- `forecastTemperatureC`, `forecastRainProbability`
- `lag1`, `lag7`, `rolling7DayMean`, `rolling7DayStd`
- `sameSlot4WeekMean`, `localityTier`, `hotspotDensityScore`
- `unitsSoldNextWindow` (target)

### Spoilage Risk Data (`b2p_spoilage_risk_data.csv`)

Columns include:
- `vendorId`, `batchId`, `productId`
- `initialPH`, `hoursSinceManufacture`, `hasRefrigerator`
- `storageType`, `ambientTemperatureC`, `humidityPct`
- `fridgeTemperatureC`, `hoursOnShelf`, `sellThroughRate`
- `effectiveTemperatureExposure`, `hoursToExpiry`
- `volumeKg`, `vendorRating`
- `riskLabel` (target: Low / Medium / High)

---

*Documentation generated for B2P ML Platform — August 2026*
