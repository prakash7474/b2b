# B2P Vendor App Redesign — Walkthrough & Verification

## Overview

The B2P Vendor experience has been updated to follow a mobile-first, 3-card layout consistent with the South Indian shop ledger design system (`clayTerracotta`, `batterCream`, `inkCharcoal`, zero drop shadows, clean borders).

---

## Key Changes Summary

### 1. Backend Routes Added & Enhanced (`app.py`)

- **`GET /api/batches/<batch_id>`**: Returns a single batch with resolved `vendor_name`.
- **`POST /api/batches/<batch_id>/report-issue`**: Allows vendors to flag delivery incidents (damaged container, wrong product, off odor, mismatch). Logs an alert event in the system audit trail.
- **`GET /api/inventory/summary?vendor_id=<id>`**: Computes an aggregated snapshot for the vendor dashboard:
  - `totalQuantityKg`
  - `minimumStockKg`
  - `belowMinimum` (boolean)
  - `batchCount` and `receivedBatchCount`
  - `oldestBatchAgeHrs`
  - `freshnessScore`
- **`POST /api/orders`**: Creates a restock request order from the vendor with status `pending_admin_approval`.
- **`GET /api/orders?vendor_id=<id>`**: Filters orders by vendor.
- **`ensure_seed_orders()`**: Automatically seeds sample vendor orders if the collection is empty.
- **`safetyStock`**: Added to the `demand_forecast` endpoint output (`safetyStock = minimumStock * 1.2`).

---

### 2. Frontend Services & TypeScript Types

- [batch.ts](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/types/batch.ts): Added `InventorySummary` and `RestockOrder` interfaces.
- [batchService.ts](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/services/batchService.ts): Added `getBatch(batchId)` and `reportIssue(batchId, issueType, description)`.
- [inventoryService.ts](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/services/inventoryService.ts): Added `getInventorySummary(vendorId)`, `getOrders(vendorId)`, and `requestRestock(payload)`.
- [predictionService.ts](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/services/predictionService.ts): Added `getFestivalCalendar()` and `getWeatherForecast()`.

---

### 3. Screen Redesigns & New Modals

#### [`VendorHomeScreen.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/VendorHomeScreen.tsx)
- Redesigned into **3 prominent display cards**:
  1. **Card 01 — Today's Demand & Restock Intelligence**:
     - Shows Predicted Demand, Current Stock in Hand, and Recommended Restock.
     - Status banner: Highlights whether stock is adequate or requisition is advised.
     - **Demand Influencing Factors**: Explains *why* demand is estimated this way (Upcoming Festival Window, Atmospheric / Weather conditions, and 7-day Sales Velocity).
     - **Request Restock button**: Directly opens the restock requisition dialog.
  2. **Card 02 — Batter Freshness & Spoilage Health**:
     - Shows overall risk badge (Low / Medium / High), hours since milling, safe shelf life remaining, and classifier confidence.
     - Actionable biochemical guidance on dispensing pace and refrigeration.
     - Shortcut button to inspect individual batches.
  3. **Card 03 — Current Inventory & Batch Snapshot**:
     - Shows total active stock, minimum reserve threshold, assigned vs received batches, and oldest batch age.
     - Quick link to open the My Batches ledger.

#### [`VendorBatchListScreen.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/VendorBatchListScreen.tsx)
- Shows all batches assigned and received by the vendor.
- Filter chips: All, Awaiting Receipt, In Store.
- For assigned batches:
  - `[✓ Confirm Delivery Receipt]` triggers [`ReceiveBatchModal`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/ReceiveBatchModal.tsx).
  - `[Report Incident]` opens [`ReportIssueModal`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/ReportIssueModal.tsx).
- For received batches:
  - `[Check Spoilage Risk & Action →]` runs the Random Forest biochemical model inline and displays [`SpoilageRiskDialog`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/SpoilageRiskDialog.tsx).

#### New Modal Components
- [`SpoilageRiskDialog.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/SpoilageRiskDialog.tsx): Shows batch-specific risk score, classifier confidence, hours since milling, safe remaining hours, and actionable advice.
- [`ReportIssueModal.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/ReportIssueModal.tsx): Allows logging container damage, mismatch, or odor incidents.
- [`RequestRestockModal.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/RequestRestockModal.tsx): Pre-fills AI-recommended restock quantity and submits restock requisition orders.

#### [`VendorDemandScreen.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/screens/vendor/VendorDemandScreen.tsx)
- Simplified for vendor use: Removed technical 4-tile ML feature grids.
- Displays clear Anticipated Demand vs Recommended Restock.
- Stock Balance table (Current in Hand, Minimum Reserve, Safety Threshold).
- Plain-English demand factors (calendar/holiday effects, temperature, sales momentum).
- Primary CTA: **Request Fresh Batter Restock**.

#### [`VendorTabNavigator.tsx`](file:///home/selvavignesh/Documents/Batter_to_platter/B2P/src/navigation/VendorTabNavigator.tsx)
- Removed the redundant standalone "Spoilage Check" tab per user request.
- Consolidated into 3 intuitive tabs:
  - **Home** (`H`)
  - **My Batches** (`B`)
  - **Demand Forecast** (`D`)

---

## Design System Compliance

- Theme: Matka clay terracotta (`#A2481F`), batter cream background (`#F3ECDD`), ink charcoal borders (`#2B241E`), paper white card surfaces (`#FBF8F2`).
- Borders: `1.5px` card borders with `2.5px` to `3.5px` top rules, no drop shadows.
- Zero pictographic emojis — only approved typographic glyphs (`✓`, `▲`, `✗`, `•`, `→`, `↺`, `✕`).
- Responsive: Fluid layout on mobile with minimum 44px touch targets; centered `maxWidth: 720px` on desktop web.
