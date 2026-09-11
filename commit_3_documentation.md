# B2P (Batter-to-Platter) Platform — Comprehensive Project State & Change Log

## 1. Executive Summary & Recommended Git Commit

### Commit Title
```text
feat: complete vendor portal implementation, dashboard chart fix, and ledger design alignment
```

### Commit Description
```text
- Redesign Vendor Portal into a mobile-first 3-tab layout (Home, My Batches, Demand Forecast)
- Implement 3-card Vendor Home Dashboard: Demand Intelligence, Spoilage Health, Inventory Snapshot
- Add per-batch SpoilageRiskDialog with biochemical risk scores and actionable recommendations
- Implement ReportIssueModal for delivery incident tracking and RequestRestockModal for store requisitions
- Unify VendorLoginScreen with the South Indian Shop Ledger theme (clay terracotta, batter cream, ink charcoal)
- Fix bar chart overlap in AdminDashboardScreen with dynamic scale limits
- Add backend endpoints: GET /api/batches/<id>, POST /api/batches/<id>/report-issue, GET /api/inventory/summary, POST /api/orders
- Add safetyStock field to demand_forecast output and vendor-scoped order filtering
- Align schema across Atlas collections (mfgTimestamp, receivedAt, expiryAt, inventory_movement, festival_calendar)
```

---

## 2. Current Architecture & Project State

| Dimension | Specification | Current State |
|---|---|---|
| **Backend** | Python Flask (`app.py`), Port 5000 | Production-ready, live ML inference, fully connected to Atlas |
| **Frontend** | React Native Web (Expo), Port 8081 | Dual-role (Admin Console + Vendor Portal), responsive mobile/desktop |
| **Database** | MongoDB Atlas (Cluster: `b2p`, DB: `b2p`) | 12 collections (7 OLTP + 5 Analytical Feature Store) |
| **ML Inference** | XGBoost (Demand) + Random Forest (Spoilage) | Real-time feature calculation from orders, weather, festivals & telemetry |
| **Design System** | South Indian Shop Ledger & Fermentation Matka | Clay Terracotta (`#A2481F`), Batter Cream (`#F3ECDD`), Ink Charcoal (`#2B241E`) |
| **Emoji Policy** | Zero Pictographic Emojis | Strict compliance (only typographic glyphs: `✓`, `▲`, `✗`, `•`, `→`, `↺`, `✕`) |

---

## 3. Before vs. After Vendor Implementation

### A. Backend & Database Schemas

| Aspect | Before Vendor Sprint | After Vendor Sprint |
|---|---|---|
| **Batch Retrieval** | Only global list `GET /api/batches` | Added `GET /api/batches/<id>` single-batch detail with resolved vendor name |
| **Incident Logging** | Admin-only manual logs | Added `POST /api/batches/<id>/report-issue` for vendors to flag damaged or mismatched deliveries |
| **Store Inventory Summary** | Raw inventory rows returned (`GET /api/inventory`), no aggregation | Added `GET /api/inventory/summary` returning total kg, min stock, status, batch counts, oldest batch age & freshness |
| **Restock Workflow** | Push-only: Admin manually assigned batches | Bidirectional: Added `POST /api/orders` for vendors to submit restock requests (`pending_admin_approval`) |
| **Order Listing** | Global list only, orders collection mostly empty | Added `?vendor_id=` filter on `GET /api/orders` and seeded realistic historical order data |
| **Demand Forecast API** | Missing `safetyStock` in response | Added `"safetyStock": round(min_stock * 1.2, 1)` to `/api/vendors/<id>/demand-forecast` |
| **Analytical Feature Store** | Hardcoded date values and missing ledger | Seeded 31 Tamil Nadu festivals in `festival_calendar`, weather overrides, live `inventory_movement` ledger, and `feature_snapshots` |

---

### B. Vendor Portal Experience

| Feature / Screen | Before Vendor Sprint | After Vendor Sprint |
|---|---|---|
| **Information Architecture** | 4 tabs with standalone "Spoilage Check" tab | Consolidated into 3 intuitive tabs: `Home`, `My Batches`, `Demand Forecast` |
| **Vendor Home Dashboard** | Generic 4 stat cards and raw buttons | **3 prominent display cards**:<br>1. *Demand Intelligence*: Anticipated demand vs stock, and plain-English factors (festivals, weather, 7-day sales velocity), plus Restock CTA.<br>2. *Spoilage Health*: Risk badge, safe shelf life remaining, and operational dispensing advice.<br>3. *Inventory Snapshot*: Active stock, minimum threshold status, and link to batches. |
| **Batch Management** | Simple list with basic receipt confirmation | Added milling timestamp (`mfgTimestamp`), `[✓ Confirm Delivery Receipt]`, `[Report Incident]`, and inline `[Check Spoilage Risk & Action →]`. |
| **Spoilage Assessment** | Detached tab with inverted score label (`riskScore` shown as health) | Replaced with in-context `SpoilageRiskDialog` providing risk percentage, hours since milling, remaining safe hours, and actionable advice. |
| **Demand Forecasting** | Dense 4-tile grid with raw ML lag features | Simplified for shopkeepers: Anticipated demand, stock balance ledger, clear factor explanations, and requisition order modal. |
| **Order Requisition** | Not possible from vendor UI | `RequestRestockModal` pre-fills AI-recommended restock quantity with custom dispatch instructions. |
| **Auth Screen Styling** | Dark `#1a1a2e` / `#4ecca3` theme with drop shadows (inconsistent) | Fully aligned with South Indian Shop Ledger theme (`#F3ECDD` background, `#FBF8F2` card, `#A2481F` button, `#2B241E` borders). |

---

### C. Admin Portal & Dashboard Fixes

| Problem | Cause | Resolution |
|---|---|---|
| **7-Day Fleet Demand Chart Overlap** | `predH` calculated up to 100px inside a fixed 75px container with hardcoded `maxVal = 75` (while fleet predictions exceeded 150kg). | Computed `maxVal` dynamically from `demandTrends`, capped max bar height strictly at 44px, and added a 48px height constraint on `barPair`. Bars now stay neatly below headings. |
| **Python Virtualenv Path Inconsistency** | Workspace folder renamed from `b2b` to `B2P`, breaking shebang lines and `activate.fish`. | Updated all paths in `.venv/bin/*`, `.venv/bin/activate.fish`, and `.venv/pyvenv.cfg`. |

---

## 4. File-by-File Change Log

### Backend Files
- **`app.py`**:
  - Implemented `GET /api/batches/<batch_id>`.
  - Implemented `POST /api/batches/<batch_id>/report-issue`.
  - Implemented `GET /api/inventory/summary`.
  - Implemented `POST /api/orders` and enhanced `GET /api/orders` with `?vendor_id=` query filter.
  - Implemented `ensure_seed_orders()` for realistic order history.
  - Added `safetyStock` field to `demand_forecast()` return payload.
  - Fixed virtualenv path references from `b2b` to `B2P`.

### Frontend Type & Service Files
- **`src/types/batch.ts`**: Added `InventorySummary` and `RestockOrder` interfaces; updated `Batch` with `mfgTimestamp`.
- **`src/services/batchService.ts`**: Added `getBatch()` and `reportIssue()` methods.
- **`src/services/inventoryService.ts`**: Added `getInventorySummary()`, `getOrders()`, and `requestRestock()` methods.
- **`src/services/predictionService.ts`**: Added `getFestivalCalendar()` and `getWeatherForecast()` methods.

### Frontend Screens & Components
- **`src/screens/vendor/VendorHomeScreen.tsx`**: Complete redesign into 3 big display cards with live demand factors, spoilage guidance, and inventory metrics.
- **`src/screens/vendor/VendorBatchListScreen.tsx`**: Updated batch ledger cards with milling dates, incident reporting, and inline spoilage risk checks.
- **`src/screens/vendor/VendorDemandScreen.tsx`**: Streamlined demand forecasting with plain-English factors and restock requisition CTA.
- **`src/screens/vendor/SpoilageRiskDialog.tsx`** *(NEW)*: Modal dialog showing biochemical risk score, confidence, shelf life remaining, and operational guidance.
- **`src/screens/vendor/ReportIssueModal.tsx`** *(NEW)*: Modal form to report delivery incidents with category chips.
- **`src/screens/vendor/RequestRestockModal.tsx`** *(NEW)*: Modal form for submitting restock requisition orders.
- **`src/screens/vendor/ReceiveBatchModal.tsx`**: Updated styling to adhere to the ledger theme tokens.
- **`src/screens/auth/VendorLoginScreen.tsx`**: Redesigned from legacy dark theme to the South Indian Shop Ledger theme.
- **`src/screens/admin/AdminDashboardScreen.tsx`**: Fixed bar chart height calculation and container layout to prevent bars from overlapping text headers.
- **`src/navigation/VendorTabNavigator.tsx`**: Removed standalone Spoilage tab; consolidated into Home, My Batches, and Demand Forecast.

---

## 5. Verification & Testing Evidence

1. **Python Compilation**:
   ```bash
   python3 -m py_compile app.py
   # Exit code: 0 (No syntax or import errors)
   ```
2. **TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   # Exit code: 0 (0 type errors across entire codebase)
   ```
3. **Backend Integration Test**:
   - `POST /api/login` → 200 (Vendor token generated)
   - `GET /api/batches/B20003` → 200 (Found batch B20003 with vendor name)
   - `POST /api/batches/B20003/report-issue` → 200 (`Issue report logged successfully`)
   - `GET /api/inventory/summary?vendor_id=V100` → 200 (`totalQuantityKg: 30.0`, `batchCount: 4`)
   - `POST /api/orders` → 200 (`order_status: pending_admin_approval`)
   - `GET /api/orders?vendor_id=V100` → 200 (Filtered list of 3 orders)
   - `GET /api/vendors/V100/demand-forecast` → 200 (`safetyStock: 12.0`, `predictedDemand: 12.8`)
4. **Emoji Verification**:
   - Strict check across all screens confirmed **0 pictographic emojis**.
