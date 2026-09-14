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
| Frontend | React Native (Expo) — Mobile app for Admin & Vendor |
| Backend | Python Flask (port 5000) |
| ML Service | Python FastAPI (recommendation engine) |
| Database | MongoDB Atlas |
| ML Models | XGBoost (demand), Random Forest (spoilage) |
| State Management | Zustand |
| Navigation | React Navigation |

## Project Structure

```
b2b/
├── app.py                      # Flask backend entry point
├── App.tsx                     # React Native root component
├── index.js                    # Expo component registration
│
├── backend/                    # Flask backend package
│   ├── config.py               #   App config, CORS, credentials
│   ├── database.py             #   MongoDB connection, utilities
│   ├── auth.py                 #   Authentication middleware
│   ├── routes/                 #   REST API route handlers
│   │   ├── dashboard.py        #     Dashboard stats, logs
│   │   ├── vendors.py          #     Vendor CRUD, forecasts
│   │   ├── batches.py          #     Batch lifecycle
│   │   ├── inventory.py        #     Inventory management
│   │   ├── orders.py           #     Order processing
│   │   └── predictions.py      #     Prediction history/stats
│   └── services/               #   ML models & utilities
│       ├── constants.py        #     Product mappings, helpers
│       ├── demand.py           #     XGBoost demand forecasting
│       ├── spoilage.py         #     Random Forest spoilage risk
│       ├── weather.py          #     Weather forecast lookup
│       └── festivals.py        #     Festival calendar
│
├── ml_service/                 # FastAPI ML recommendation service
│   ├── main.py                 #   FastAPI app entrypoint
│   ├── haversine.py            #   Distance calculation
│   ├── retrain_models.py       #   Model retraining script
│   └── routers/
│       └── recommend.py        #     POST /recommend endpoint
│
├── src/                        # React Native application
│   ├── components/             #   Shared UI components
│   │   └── ledger/             #     Ledger-themed components
│   ├── navigation/             #   React Navigation setup
│   ├── screens/                #   Screen components
│   │   ├── admin/              #     Admin screens (14)
│   │   ├── auth/               #     Auth screens (3)
│   │   └── vendor/             #     Vendor screens (9)
│   ├── services/               #   API client layer
│   ├── store/                  #   Zustand state management
│   ├── theme/                  #   Design system
│   └── types/                  #   TypeScript definitions
│
├── tests/                      # Python test suite
│   ├── conftest.py             #   Fixtures, FakeMongo
│   └── test_*.py               #   Test files
│
├── static/                     # Expo assets (icons, splash)
├── haversine.py                # Canonical haversine implementation
├── requirements.txt            # Python dependencies
├── package.json                # Node/Expo dependencies
├── pyproject.toml              # pytest/coverage config
└── app.json                    # Expo app configuration
```

## Setup

### Prerequisites

- Python 3.9+
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Install Node Dependencies

```bash
npm install
```

### 3. Verify ML Model Files

Ensure these exist in `ml_service/`:
- `demand_forecast_model.pkl`
- `spoilage_risk_model.pkl`

If missing, generate them:
```bash
python ml_service/retrain_models.py
```

### 4. Environment Variables (Optional)

```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"
```

If not set, the app uses a default hardcoded connection string.

## Running

### Backend (Flask)

```bash
python app.py
# → http://localhost:5000
```

### Frontend (Expo)

```bash
npm start
# → Opens Expo DevTools
# → Press 'a' for Android, 'i' for iOS, 'w' for web
```

### ML Recommendation Service (Optional)

```bash
cd ml_service
uvicorn main:app --reload --port 8000
# → http://localhost:8000
```

## Testing

### Backend Tests

```bash
npm run test:backend
# or
python -m pytest tests/ -v
```

### Frontend Tests

```bash
npm run test:frontend
# or
npx jest
```

### With Coverage

```bash
npm run test:backend:coverage
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/dashboard` | GET | Aggregated stats |
| `GET /api/vendors` | GET | List vendors |
| `POST /api/vendors` | POST | Create vendor |
| `GET /api/vendors/<id>` | GET | Vendor detail |
| `PUT /api/vendors/<id>/verify` | PUT | Verify/reject vendor |
| `GET /api/batches` | GET | List batches |
| `POST /api/batches` | POST | Create batch |
| `GET /api/inventory` | GET | List inventory |
| `POST /api/inventory` | POST | Create inventory item |
| `GET /api/inventory/<id>/spoilage-risk` | GET | ML spoilage risk |
| `GET /api/orders` | GET | List orders |
| `POST /api/predict-demand` | POST | Demand prediction |
| `POST /api/predict-spoilage` | POST | Spoilage prediction |
| `GET /api/history` | GET | Prediction history |

## Database

MongoDB database: **`b2p`**

| Collection | Description |
|------------|-------------|
| `users` | User accounts (admin, vendor) |
| `vendors` | Vendor profiles with location |
| `products` | Product catalog |
| `inventory` | Current stock per vendor |
| `orders` | Customer orders |
| `batches` | Production batches |
| `predictions` | ML prediction history |

## Retraining Models

After 8-12 weeks of real data, or when performance degrades:

```bash
python ml_service/retrain_models.py
```

This reads CSV training data and regenerates both `.pkl` model files.

## Documentation

- [Full Documentation](DOCUMENTATION.md) — Architecture, database schema, ML models
- [Stock Allocation](STOCK_ALLOCATION_README.md) — Stock allocation lifecycle
- [Demand Model](demand_forecast_model_documentation.md) — Feature engineering, training
- [Spoilage Model](spoilage_risk_model_documentation.md) — Risk classification
