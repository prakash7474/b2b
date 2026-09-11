# B2P (Batter-to-Plate) — ML Prediction Platform

A full-stack ML-powered platform for predicting demand and spoilage risk for fresh batter products (Idli, Dosa, Combo Pack) sold through small vendors.

## Overview

Small food vendors selling fresh batter face two critical challenges:
- **Overstocking** → spoilage, waste, financial loss
- **Understocking** → lost sales, unhappy customers

This platform provides:
- **Demand Forecasting** — Predict how many units a vendor will sell in the next time window
- **Spoilage Risk Classification** — Classify batches as Low / Medium / High risk
- **Dispatch Recommendations** — Calculate optimal restock quantities
- **Admin Dashboard** — Monitor vendors, inventory, orders, alerts, and ML predictions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JavaScript (SPA) |
| Backend | Python Flask (single app) |
| Database | MongoDB Atlas (single `b2p` database) |
| ML Models | XGBoost (demand), Random Forest (spoilage) |
| Data Processing | pandas, NumPy, scikit-learn |

## Project Structure

```
.
├── app.py                          # Unified Flask backend (port 5000)
├── static/
│   └── index.html                  # Unified SPA frontend (10 pages)
│
├── demand_forecast_model.pkl       # XGBoost demand model bundle
├── spoilage_risk_model.pkl         # Random Forest spoilage model bundle
├── retrain_models.py               # Script to retrain both models
├── requirements.txt                # Python dependencies
│
├── b2p_demand_forecasting_data.csv  # Demand model training data
├── b2p_spoilage_risk_data.csv       # Spoilage model training data
│
├── DOCUMENTATION.md                # Full project documentation
├── STOCK_ALLOCATION_README.md      # Stock allocation, lifecycle & spoilage risk logic
├── demand_forecast_model_documentation.md
├── spoilage_risk_model_documentation.md
└── B2P_Database_Schema_Black_White_v2.html
```

## Pages

| Page | Description |
|------|-------------|
| 📊 Dashboard | Aggregated stats: vendors, inventory, orders, alerts, predictions |
| 🏪 Vendors | List, detail view, verify/reject registration, ML demand forecast |
| 📦 Orders | Filterable list with search, detail modal with order items |
| 📋 Inventory | Freshness bars, low stock flags, ML spoilage risk per item |
| 🔔 Alerts | Low stock, spoilage risk, expiry warnings (filterable) |
| ⭐ Recommendations | Vendor ranking by distance, stock, freshness, rating |
| 🤖 AI Predictions | Run ML demand forecast + spoilage risk for all vendors/inventory |
| 📈 Demand Forecast | Manual 17-field form → ML prediction → stored in DB |
| ⚠️ Spoilage Risk | Manual 14-field form → ML risk assessment → stored in DB |
| 📜 Prediction History | All past predictions with stats |

## Setup

### Prerequisites

- Python 3.9+
- MongoDB Atlas account (or local MongoDB)

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Verify ML Model Files

Ensure these exist in the project root:
- `demand_forecast_model.pkl`
- `spoilage_risk_model.pkl`

If missing, generate them:
```bash
python retrain_models.py
```

### 3. Environment Variables (Optional)

```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"
```

If not set, the app uses a default hardcoded connection string.

## Running

```bash
python app.py
# → http://localhost:5000
```

On first run, the app automatically seeds the database with sample data:
- 9 users, 5 vendors, 4 products
- 10 inventory items, 8 orders, 11 order items
- 8 alerts, 7 recommendations

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/dashboard` | GET | Aggregated stats (all collections) |
| `GET /api/vendors` | GET | List all vendors |
| `POST /api/vendors` | POST | Create vendor |
| `GET /api/vendors/<id>` | GET | Vendor detail |
| `DELETE /api/vendors/<id>` | DELETE | Delete vendor |
| `PUT /api/vendors/<id>/verify` | PUT | Verify/reject vendor |
| `GET /api/vendors/<id>/inventory` | GET | Vendor's inventory |
| `GET /api/vendors/<id>/orders` | GET | Vendor's delivery orders |
| `GET /api/vendors/<id>/demand-forecast` | GET | ML demand (auto-derived from DB) |
| `GET /api/products` | GET | List all products |
| `POST /api/products` | POST | Create product |
| `DELETE /api/products/<id>` | DELETE | Delete product |
| `GET /api/batches` | GET | List all batches |
| `POST /api/batches` | POST | Create batch |
| `DELETE /api/batches/<id>` | DELETE | Delete batch |
| `GET /api/inventory` | GET | List all inventory |
| `POST /api/inventory` | POST | Create inventory item |
| `GET /api/inventory/<id>` | GET | Inventory item detail |
| `DELETE /api/inventory/<id>` | DELETE | Delete inventory item |
| `GET /api/inventory/<id>/spoilage-risk` | GET | ML spoilage risk (auto-derived from DB) |
| `GET /api/orders` | GET | List orders (filterable: vendor_id, order_status, payment_status, search) |
| `GET /api/orders/<id>` | GET | Order with items |
| `GET /api/alerts` | GET | Alerts (filterable: alert_type, alert_status) |
| `GET /api/recommendations` | GET | Vendor recommendations |
| `POST /api/predict-demand` | POST | Manual demand prediction (stored in DB) |
| `POST /api/predict-spoilage` | POST | Manual spoilage prediction (stored in DB) |
| `GET /api/history` | GET | Prediction history |
| `GET /api/stats` | GET | Prediction statistics |

## Database

Single MongoDB database: **`b2p`**

| Collection | Description |
|------------|-------------|
| `users` | User accounts (admin, vendor, customer) |
| `vendors` | Vendor profiles with location, rating, verification |
| `products` | Product catalog (Idli, Dosa, Combo, Rava batter) |
| `inventory` | Current stock per vendor with freshness scores |
| `orders` | Customer orders with payment and delivery info |
| `order_items` | Line items per order |
| `batches` | Production batches with pH and volume |
| `inventory_alerts` | Low stock, spoilage risk, expiry warnings |
| `vendor_recommendations` | Ranked vendor suggestions per customer |
| `predictions` | ML prediction history (demand + spoilage) |

## Retraining Models

After 8-12 weeks of real data, or when performance degrades:

```bash
python retrain_models.py
```

This reads CSV training data and regenerates both `.pkl` model files.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MongoDB Connection Error | Verify `MONGODB_URI`; check firewall allows Atlas access |
| Model Not Found | Ensure `.pkl` files are in project root; run `retrain_models.py` |
| Port Already in Use | Change port in `app.run(..., port=XXXX)` or kill the process |
| Import Error (xgboost) | Run `pip install xgboost>=2.0` |
| Empty Dashboard | First run auto-seeds data; check MongoDB connection |

## Documentation

- [Full Documentation](DOCUMENTATION.md) — Architecture, database schema, ML models, data flow
- [Demand Model Docs](demand_forecast_model_documentation.md) — Feature engineering, training details
- [Spoilage Model Docs](spoilage_risk_model_documentation.md) — Risk classification, probabilities
- [Database Schema](B2P_Database_Schema_Black_White_v2.html) — Visual schema reference
