# Stock Allocation, Inventory Lifecycle & Spoilage Risk Management

Comprehensive documentation for the **B2P (Batter-to-Plate)** Stock Allocation engine, vendor storefront inventory lifecycle, and ML-powered spoilage risk evaluation.

---

## 1. Overview & Architecture

The B2P platform manages the distribution and life cycle of fresh batter products (*Idli Batter*, *Dosa Batter*, *Combo Pack*) from central production plants to neighborhood vendors. 

Because fresh batter is a perishable FMCG product with a strict shelf life (typically 48–72 hours depending on refrigeration), precise tracking of **stock allocation**, **store depletion (stockout)**, and **real-time spoilage risk** is essential to prevent both food waste and stockout loss.

```
[ Central Production ] 
        │
        ▼
   Batch Created (status: "created")
        │
        ▼
   Allocated to Vendor (status: "assigned", allocated volume kg)
        │
        ▼
   Vendor Storefront Confirmation (status: "received", active store inventory)
        │
        ├──▶ Sales / Depletion ──▶ Stock Out (status: "stockout") ──▶ Removed from Store Page
        │
        └──▶ ML Telemetry Monitoring (Fridge Temp, Ambient Temp, Hours Since Mfg)
                 ├── Low Risk (Safe shelf life > 36h)
                 ├── Medium Risk (Promote / Discount)
                 └── High Risk (Discard warning)
```

---

## 2. Batch Lifecycle & Allocation States

Every production batch follows a deterministic lifecycle:

| Status | Stage | Storefront Page Behavior | Inventory Count |
| :--- | :--- | :--- | :--- |
| `created` | Manufactured at central facility | Not visible to vendor | Excluded from store inventory |
| `assigned` | Allocated & dispatched to vendor | Appears in **"Awaiting Receipt"** tab | Pending receipt (not yet sellable) |
| `received` | Vendor confirms physical delivery | Appears in **"In Store"** tab | **Active store inventory** (batter in hand) |
| `stockout` | Batter completely sold out or depleted | **Removed from "In Store"**; moved to **"Stocked Out"** tab | Deducted from store inventory |
| `expired` | Passed maximum consumable threshold | Flagged for immediate disposal | Excluded from store inventory |
| `recalled` | Administrative recall / quality hold | Locked from sale | Excluded from store inventory |

---

## 3. Store Page Depletion & Stock-Out Workflow

### Automatic Removal from the Store Page
In the vendor app ([`VendorBatchListScreen.tsx`](file:///C:/Users/Prakash/b2b-1/src/screens/vendor/VendorBatchListScreen.tsx)), the storefront page features filterable tabs:
- **All**: Complete batch history.
- **Awaiting Receipt**: Batches dispatched from the warehouse awaiting vendor confirmation.
- **In Store**: Active batches physically present in the store (`status: "received"`).
- **Stocked Out**: Historical records of fully depleted batches (`status: "stockout"`).

### How a Batch is Marked Stock-Out:
1. **From Batch Card**: Vendors can tap **"✕ Mark Stock Out (Remove)"** directly on any received batch card in the "In Store" tab.
2. **From Spoilage Risk Modal**: Inside [`SpoilageRiskDialog.tsx`](file:///C:/Users/Prakash/b2b-1/src/screens/vendor/SpoilageRiskDialog.tsx), a dedicated **"✕ Mark Stock Out (Remove from Store)"** action is available.
3. **Execution**:
   - A confirmation dialog is prompted.
   - Upon confirmation, the vendor app dispatches `stockoutBatch(batchId)`.
   - The batch is **instantly removed** from the active store list and decremented from total store volume.
   - An audit trail entry is inserted into `inventory_movement` (`movementType: "stockout"`).

---

## 4. Spoilage Risk Calculation & Logical Fixes

### 4.1 Inverted Freshness Score Bug Fix
* **Problem**: The backend previously set `"freshnessScore": composite_risk`. Because `composite_risk` was `0.90` for High Risk batches, high-risk items paradoxically showed **90% Freshness Health** in the UI.
* **Resolution**: Freshness score is now correctly calculated as the mathematical complement of spoilage risk:
  $$\text{freshnessScore} = \max(0.0, \min(1.0, 1.0 - \text{composite\_risk}))$$
  - High Risk (0.90 risk) $\rightarrow$ **10% Freshness Health** (Subdued red badge).
  - Low Risk (0.10 risk) $\rightarrow$ **90% Freshness Health** (Vibrant green badge).

### 4.2 Empty Store / Zero-Stock False Alarm Fix
* **Problem**: When a vendor had 0 kg in stock or all batches were depleted, the ML prediction endpoint queried old batches from the database, calculating days-old manufacture timestamps and falsely triggering:
  > *"CRITICAL SPOILAGE RISK: Discard stock immediately"* on an empty store.
* **Resolution**:
  - `predict_spoilage_for_vendor` checks total inventory quantity and filters strictly for `status: "received"` batches.
  - If inventory is 0 kg or no active batches exist:
    ```json
    {
      "isStockOut": true,
      "riskLabel": "None",
      "riskScore": 0.0,
      "freshnessScore": 0.0,
      "statusMessage": "Store is currently out of stock. Spoilage evaluation paused."
    }
    ```
  - **Vendor Dashboard ([`VendorHomeScreen.tsx`](file:///C:/Users/Prakash/b2b-1/src/screens/vendor/VendorHomeScreen.tsx))**:
    - **Card 01 (Status Banner)**: Displays clear **"STOCK OUT: Store has 0 kg batter in hand"**.
    - **Card 02 (Freshness Health)**: Replaces the panic "High Risk" alert with a **"STOCK OUT"** chip, `0 hrs` safe shelf life, and a primary **"Request Restock Batch"** button.
    - **Card 03 (Current Inventory)**: Displays **"OUT OF STOCK"** tag and `0` batches in store.

### 4.3 Dynamic Shelf Life Calculation
* **Problem**: Previously `hours_to_expiry = max(0, (expiry - now))` relied on static seed timestamps in the past, pinning safe shelf life to `0 hrs` even for newly assigned batches.
* **Resolution**: Safe remaining shelf life is dynamically evaluated based on production elapsed time (`hours_since_mfg`) and storage condition:
  $$\text{hoursToExpiry} = \max(0.0, \text{max\_shelf\_life} - \text{hours\_since\_mfg})$$
  Adjusted downward if cold-chain telemetry detects refrigeration violations ($> 8^\circ\text{C}$).

### 4.4 Stale Modal Prediction Cache Fix
* **Problem**: In [`SpoilageRiskDialog.tsx`](file:///C:/Users/Prakash/b2b-1/src/screens/vendor/SpoilageRiskDialog.tsx), opening a new batch retained the previously viewed batch's prediction during the fetch network delay.
* **Resolution**: [`predictionStore.ts`](file:///C:/Users/Prakash/b2b-1/src/store/predictionStore.ts) resets `batchSpoilage: null` before dispatching the fetch request, ensuring a clean loading skeleton until the exact batch data arrives.

---

## 5. API Endpoints Reference

### 1. Mark Batch as Stock Out
* **Route**: `PUT /api/batches/<batch_id>/stockout` (also supports `POST` and `PATCH`)
* **Headers**: `Authorization: Bearer <token>`
* **Description**: Transitions batch to `status: "stockout"`, stamps `stocked_out_at`, reduces active vendor inventory, and records `inventory_movement`.
* **Response**:
  ```json
  {
    "ok": true,
    "batch_id": "B14148",
    "status": "stockout",
    "message": "Batch #B14148 marked as Stock Out and removed from store page"
  }
  ```

### 2. Fetch Active In-Store Batches
* **Route**: `GET /api/batches?vendor_id=<id>&status=received`
* **Description**: Returns only active batches physically in store. Excludes all batches with status `stockout`, `assigned`, or `expired`.

### 3. Vendor Spoilage & Freshness Assessment
* **Route**: `GET /api/vendors/<vendor_id>/predict-spoilage`
* **Response (Active Stock)**:
  ```json
  {
    "riskLabel": "Low",
    "riskScore": 0.15,
    "freshnessScore": 0.85,
    "hoursToExpiry": 38.5,
    "isStockOut": false,
    "fridgeTemperatureC": 4.2
  }
  ```
* **Response (Stock Depleted)**:
  ```json
  {
    "riskLabel": "None",
    "riskScore": 0.0,
    "freshnessScore": 0.0,
    "hoursToExpiry": 0.0,
    "isStockOut": true,
    "statusMessage": "Store is currently out of stock. Spoilage evaluation paused."
  }
  ```

### 4. Batch-Specific Spoilage Prediction
* **Route**: `GET /api/batches/<batch_id>/predict-spoilage`
* **Description**: Evaluates telemetry for a specific batch. If the batch is already stocked out, immediately returns `isStockOut: true` with `riskLabel: "None"`.

---

## 6. Verification & Test Suite

An automated verification script is maintained in the project repository:

```bash
# Run backend verification
python scratch/test_spoilage_stockout.py

# Run TypeScript compile check
npx tsc --noEmit
```

### Test Assertions Verified:
1. `GET /api/inventory/summary`: Confirms 0 batch count and 0 kg inventory when depleted.
2. `GET /api/vendors/V100/predict-spoilage`: Confirms `isStockOut: false` with accurate `freshnessScore = 1.0 - riskScore` when active stock exists.
3. `PUT /api/batches/<id>/stockout`: Confirms status update to `stockout` and audit trail entry creation.
4. `GET /api/batches?vendor_id=V100&status=received`: Confirms stocked-out batch is strictly excluded from active received batches.
5. `GET /api/batches/<id>/predict-spoilage`: Confirms `isStockOut: true` with `riskLabel: "None"` for stocked-out batches.
