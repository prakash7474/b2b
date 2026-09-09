# B2P (Batter-to-Platter) Platform — Pre-Vendor Architecture & State Documentation

> **Commit Reference**: Prior to Vendor Portal Sprint & Vendor Requisition Architecture  
> **Release Milestone**: Phase A–E Admin Operations Ledger & Schema Evolution  
> **Scope**: Central Kitchen Command, Admin Operations Console, Schema Normalization, Live ML Pipeline

---

## 1. Ready-to-Use Git Commit Summary

### Commit Title
```text
feat(admin): complete phase A-E schema evolution, live ML dashboard, and south indian shop ledger UI
```

### Commit Body / PR Description
```text
- Complete Phases A-D database schema evolution on MongoDB Atlas:
  * Normalize field naming to camelCase (mfgTimestamp, receivedAt, expiryAt, minimumStock, freshnessScore)
  * Introduce GeoJSON Point location coordinates and 2dsphere index for active vendors
  * Add assignment_log append-only audit trail to batch documents
  * Implement inventory_movement append-only physical ledger (receive, add, remove, edit)
  * Deploy analytical collections: festival_calendar (31 seeded TN festivals), weather_forecast, feature_snapshots
- Revamp Admin Dashboard with 100% live telemetry and ML inference (zero mock data):
  * Real-time XGBoost demand forecasting across all active partner shops
  * Real-time Random Forest biochemical spoilage classification over active batches
  * Day-of-week and festival-modulated 7-day demand trend
  * Weekly dispatch trend aggregated dynamically from batch assignment logs
- Implement South Indian Shop Ledger design system across Admin Console:
  * Clay Terracotta (#A2481F), Batter Cream (#F3ECDD), Ink Charcoal (#2B241E)
  * Ruled rectangular panels, 1.5px ink borders, 2.5px top ledger rules, zero drop shadows
  * 6-item bottom ledger navigation bar with responsive layout for mobile and desktop
  * Strict zero-emoji policy (exclusively approved typographic glyphs)
- Integrate dual ML model bundles (demand_forecast_model.pkl & spoilage_risk_model.pkl)
- Add comprehensive prediction history logging, telemetry auditing, and system logs
```

---

## 2. System Architecture at Pre-Vendor State

At this milestone, the B2P platform operated primarily as a **Central Kitchen Command & Operations Management System**. Central kitchen supervisors managed batter production, assigned batches to partner vendors, monitored warehouse reserves, and evaluated predictive models.

```
[ Central Kitchen Command ] ───► [ Batch Production ] ───► [ Vendor Assignment ]
           │                                                        │
           ├──► [ Live ML Demand Forecast (XGBoost) ]               ▼
           ├──► [ Live ML Spoilage Risk (Random Forest) ]   [ Inventory Ledger ]
           └──► [ Festival & Weather Feature Store ]        (Atlas Collections)
```

### Core Technology Stack
- **Backend**: Python 3.14 Flask API (`app.py`), running on port 5000.
- **Frontend**: React Native Web with Expo, running on port 8081.
- **Database**: MongoDB Atlas Cluster `b2p`, database `b2p`.
- **ML Runtime**: `scikit-learn`, `xgboost`, `pandas`, `joblib` loaded at startup.
- **State Management**: Zustand stores (`batchStore`, `vendorStore`, `predictionStore`, `authStore`).
- **Design Language**: South Indian Shop Ledger & Fermentation Matka Theme.

---

## 3. Database Collections & Schema Definition (Atlas State)

### 3.1 Operational Collections (OLTP)

1. **`vendors`**
   - Stores registered partner retail shops, tiffin centers, and mess counters.
   - **Fields**: `vendor_id`, `shop_name`, `owner_name`, `phone`, `address`, `fssai_cert`, `verificationStatus` (`active`, `pending`, `rejected`, `terminated`), `verifiedAt`, `hasRefrigerator`, `storageType` (`counter`, `fridge`, `deep_freeze`), `fridgeTemperatureC`, `rating`, `localityTier`, `hotspotDensityScore`, `location` (GeoJSON `Point`), `latitude`, `longitude`, `createdAt`.
   - **Indexes**: `vendor_id` (unique), `location` (`2dsphere`).

2. **`batches`**
   - Represents physical batter production runs at the central kitchen.
   - **Fields**: `batch_id`, `batch_number`, `product_name` (*Idli Batter* default), `manufacturer`, `volume_kg`, `initialPH`, `temperatureC`, `humidityPct`, `fermentationHours`, `notes`, `status` (`created` → `assigned` → `received`), `vendor_id`, `assignment_log` (`[{vendor_id, assigned_at, assigned_by}]`), `assigned_at`, `received_at`, `received_notes`, `mfgTimestamp`, `created_at`.
   - **Indexes**: `batch_id` (unique), `vendor_id`, `status`, `created_at`.

3. **`inventory`**
   - Active store inventory per vendor.
   - **Fields**: `inventory_id`, `vendor_id`, `product_id`, `product_name`, `batch_number`, `quantity`, `minimumStock`, `price`, `manufactureDate`, `expiryAt`, `receivedAt`, `freshnessScore`.
   - **Indexes**: `inventory_id` (unique), `vendor_id`, `product_name`.

4. **`orders` & `order_items`**
   - Order history and point-of-sale lines.
   - **Fields (`orders`)**: `order_id`, `user_id`, `vendor_id`, `order_date`, `total_amount`, `payment_method`, `payment_status`, `order_status`.
   - **Fields (`order_items`)**: `order_item_id`, `order_id`, `inventory_id`, `quantity`, `unit_price`, `subtotal`.

5. **`logs`**
   - Operational event trail.
   - **Fields**: `timestamp`, `type` (`activity`, `alert`, `system`), `severity` (`info`, `warning`, `critical`), `actor`, `event`, `related_to`, `metadata`.

### 3.2 Analytical Collections (Feature Store)

6. **`festival_calendar`**
   - 31 regional Tamil Nadu & national festivals seeded for 2026–2027 (e.g., Pongal, Tamil New Year, Diwali, Karthigai Deepam).
   - **Fields**: `date` (`YYYY-MM-DD`, unique sparse index), `festivalName`, `festivalType`, `region`, `windowDays`.

7. **`weather_forecast`**
   - Micro-climate atmospheric telemetry for demand and spoilage inference.
   - **Fields**: `locationGridKey`, `forecastFor`, `forecastIssuedAt`, `temperatureC`, `rainProbability`, `humidityPct`, `source`.

8. **`inventory_movement`**
   - Append-only ledger recording every stock transition.
   - **Fields**: `movementId`, `vendorId`, `productId`, `batchId`, `movementType` (`receive`, `edit`, `add`, `remove`, `adjustment`, `sale`), `quantity`, `occurredAt`, `previousQty`, `newQty`, `triggeredBy`, `notes`.

9. **`predictions`**
   - History of all machine learning inference runs.
   - **Fields**: `predictionType` (`DEMAND`, `SPOILAGE_RISK`), `vendorId`, `batchId`, `productId`, `predictedValue`, `numericValue`, `confidence`, `recommendedDispatch`, `windowStart`, `windowEnd`, `inputFeatures`, `modelVersion`, `generatedAt`.

10. **`feature_snapshots`**
    - Exact feature vectors preserved for reproducible ML retraining.
    - **Fields**: `snapshotId`, `vendorId`, `predictionId`, `predictionType`, `featureVector`, `targetValue`, `datasetVersion`, `createdAt`.

---

## 4. Machine Learning Integration

### 4.1 Demand Forecast Model (`demand_forecast_model.pkl`)
- **Algorithm**: XGBoost Regressor.
- **Input Features (17)**:
  `localityTierEnc`, `hotspotDensityScore`, `productIdEnc`, `hourSin`, `hourCos`, `weekdaySin`, `weekdayCos`, `isWeekend`, `isFestivalWindow`, `forecastTemperatureC`, `forecastRainProbability`, `lag1`, `lag7`, `rolling7DayMean`, `rolling7DayStd`, `sameSlot4WeekMean`, `recentTrend`.
- **Target**: Predicted sales volume in kilograms.
- **Dynamic Factors**: Incorporates live weather forecast via `get_weather_for_date()` and calendar events via `get_festival_context()`.

### 4.2 Spoilage Risk Model (`spoilage_risk_model.pkl`)
- **Algorithm**: Random Forest Classifier.
- **Input Features (13)**:
  `initialPH`, `hoursSinceManufacture`, `hasRefrigerator`, `storageTypeEnc`, `ambientTemperatureC`, `humidityPct`, `fridgeTemperatureC`, `hoursOnShelf`, `sellThroughRate`, `effectiveTemperatureExposure`, `hoursToExpiry`, `volumeKg`, `vendorRating`.
- **Target Classes**: `Low`, `Medium`, `High`.
- **Composite Risk Score**: Computed directly from class probabilities:
  $$\text{Composite Risk} = (P_{\text{High}} \times 0.90) + (P_{\text{Med}} \times 0.50) + (P_{\text{Low}} \times 0.15)$$

---

## 5. Backend Route Catalog (Pre-Vendor State)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/login` | POST | Authentication for admin and vendor roles |
| `/api/logout` | POST | Session invalidation |
| `/api/me` | GET | Current session verification |
| `/api/dashboard` | GET | Live Admin Operations Ledger summary with aggregated ML feeds |
| `/api/dashboard/summary` | GET | Alias for dashboard |
| `/api/vendors` | GET | List vendors (filterable by `status: pending/active/all`, sortable by `demand/name/batches`) |
| `/api/vendors` | POST | Register new vendor with storage & location attributes |
| `/api/vendors/<id>` | GET | Vendor detail with assigned batch history |
| `/api/vendors/<id>` | PATCH/PUT | Update vendor profile or approval status (`active`/`rejected`/`terminated`) |
| `/api/vendors/<id>` | DELETE | Delete vendor and related batches |
| `/api/products` | GET | List catalog products |
| `/api/batches` | GET | List batches (filterable by `vendor_id` and `status`) |
| `/api/batches` | POST | Create new batch with pH, temperature, and fermentation telemetry |
| `/api/batches/<id>` | PUT/PATCH | Update batch parameters |
| `/api/batches/<id>/assign` | PUT/PATCH | Assign batch to vendor with `assignment_log` entry |
| `/api/batches/<id>/receive` | PUT/PATCH | Confirm batch receipt, creates inventory record and movement entry |
| `/api/batches/<id>` | DELETE | Delete batch |
| `/api/inventory` | GET | List current vendor inventory |
| `/api/inventory` | POST/PATCH | Mutate inventory (add, remove, edit, adjust) with ledger tracking |
| `/api/inventory-movement` | GET | View historical stock ledger entries |
| `/api/weather-forecast` | GET, POST | Read or manually override daily weather telemetry |
| `/api/festival-calendar` | GET | Fetch regional festival calendar |
| `/api/orders` | GET | List global historical orders |
| `/api/vendors/<id>/demand-forecast` | GET | Run auto-derived XGBoost forecast for vendor |
| `/api/vendors/<id>/predict-spoilage` | GET | Run auto-derived spoilage inference for vendor |
| `/api/batches/<id>/predict-spoilage` | GET | Run batch-level Random Forest spoilage inference |
| `/api/predict-demand` | POST | Manual interactive demand prediction |
| `/api/predict-spoilage` | POST | Manual interactive spoilage prediction |
| `/api/history` | GET | Prediction audit trail |
| `/api/stats` | GET | Prediction volume metrics |
| `/api/logs` | GET, POST | Operational event logs |

---

## 6. Frontend Admin UI State

### Admin Navigation Layout (6-Item Bottom Ledger Bar)
1. **Dashboard** (`AdminDashboardScreen`):
   - Fleet Overview: Active vendors, total batches, delivered, in transit.
   - Inventory Snapshot: Total reserve in kg, low stock alerts.
   - 7-Day Fleet Demand chart.
   - Top Demand Spike vendors.
   - Fleet Spoilage Risk distribution bar (`Green` / `Amber` / `Red`).
   - Vendor Requisition queue for pending shop registrations.
2. **Vendors** (`VendorListScreen`, `VendorDetailScreen`, `CreateVendorScreen`):
   - Partner directory with verification status badges, refrigerator telemetry, and shop ratings.
3. **Batches** (`BatchListScreen`, `CreateBatchScreen`, `AssignBatchModal`):
   - Central kitchen batch registry with pH, temperature, fermentation hours, and status (`created`, `assigned`, `received`).
4. **Stock** (`InventoryListScreen`):
   - Current warehouse stock, minimum thresholds, freshness scores, and adjustment actions.
5. **History** (`PredictionHistoryScreen`):
   - Chronological feed of all ML inference runs with confidence and feature vectors.
6. **Logs** (`LogsScreen`):
   - Audit trail of system events, delivery confirmations, and status transitions.

---

## 7. What Was NOT Yet Implemented at This State

1. **Vendor Self-Service Experience**:
   - No dedicated vendor-facing dashboard.
   - No mobile-optimized 3-card layout (Demand, Spoilage Health, Inventory).
   - No batch-level `SpoilageRiskDialog` for retail shopkeepers.
   - No delivery incident reporting mechanism (`ReportIssueModal`).
   - No restock requisition workflow (`RequestRestockModal`).
2. **Backend Vendor Scoping**:
   - `GET /api/batches/<id>` single batch detail route did not exist.
   - `POST /api/batches/<id>/report-issue` was not implemented.
   - `GET /api/inventory/summary` aggregated endpoint was not implemented.
   - `POST /api/orders` was not implemented; `GET /api/orders` could not be filtered by `vendor_id`.
   - `safetyStock` was omitted from `/api/vendors/<id>/demand-forecast`.
3. **UI Theme Consistency**:
   - Vendor login screen was still styled in dark blue (`#1a1a2e`) and teal (`#4ecca3`) with drop shadows, inconsistent with the South Indian Shop Ledger theme.
4. **Chart Bounds**:
   - Admin 7-day demand bar chart was hardcoded to `maxVal = 75`, causing bars to overlap text headers during high-volume fleet demand.
