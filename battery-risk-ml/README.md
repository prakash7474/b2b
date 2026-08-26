# Battery Risk ML Prediction System

A machine learning API that predicts battery/batter spoilage risk using a trained `RandomForestClassifier` model, with model storage and prediction history managed via MongoDB Atlas GridFS.

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [System Components](#system-components)
- [Model Details](#model-details)
- [Setup & Installation](#setup--installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Web UI](#web-ui)
- [Data Pipeline](#data-pipeline)
- [Test Suite](#test-suite)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                         │
│              http://localhost:8000 (Web UI)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Server (app.py)                   │
│                   Port 8000 / CORS enabled                  │
│                                                             │
│  GET  /         → Serves static/index.html (Web UI)         │
│  GET  /health   → Health check (MongoDB + Model status)     │
│  POST /predict  → Run ML prediction + store in MongoDB      │
│  GET  /docs     → Swagger UI (auto-generated)               │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────┐              │
│  │  Model (RAM) │    │  MongoDB Client       │              │
│  │  loaded once │    │  predictions collection│              │
│  │  at startup  │    └──────────────────────┘              │
│  └──────────────┘                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ MongoDB Atlas│  │ Model (pkl)  │  │ Node.js      │
│ GridFS       │  │ in GridFS    │  │ Data Scripts │
│ (model store)│  │              │  │ (pull-data)  │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Request Flow

1. **User** enters battery parameters in the Web UI
2. **FastAPI** receives the request at `POST /predict`
3. **Model** (loaded in RAM at startup) runs `predict()` and `predict_proba()`
4. **Result** is returned as JSON with prediction + confidence scores
5. **MongoDB** stores the input, prediction, and confidence in the `predictions` collection

---

## Project Structure

```
battery-risk-ml/                    # ML backend
│
├── app.py                          # FastAPI server (main entry point)
├── model_loader.py                 # Downloads model from MongoDB GridFS, caches in RAM
├── upload_model.py                 # Uploads batter_risk_model.pkl to MongoDB GridFS
├── test_model.py                   # CLI test runner (20 test cases from input.json)
│
├── batter_risk_model.pkl           # Trained RandomForestClassifier (do not modify)
├── input.json                      # Test input data (20 test cases, do not modify)
│
├── static/
│   └── index.html                  # Web UI (single-page HTML/CSS/JS)
│
├── .env                            # MongoDB credentials (do NOT commit)
├── .gitignore                      # Git ignore rules
├── requirements.txt                # Python dependencies
└── README.md                       # This file

Root project/
│
├── pull-data.js                    # Node.js script to pull sample data from MongoDB
├── test-connection.js              # Node.js script to test MongoDB Atlas connection
├── atlas-credentials.env           # Node.js MongoDB credentials (do NOT commit)
├── package.json                    # Node.js dependencies
│
└── data/
    └── sample_mflix/               # Exported MongoDB sample data
        ├── embedded_movies.json
        ├── movies.json
        ├── sessions.json
        ├── theaters.json
        └── users.json
```

---

## System Components

### 1. FastAPI Server (`app.py`)

The main API server that:

- Loads the ML model from MongoDB Atlas GridFS at startup (via `model_loader.py`)
- Connects to MongoDB for storing predictions
- Serves the Web UI at `GET /`
- Provides REST API endpoints for health checks and predictions
- Includes CORS middleware for cross-origin requests

**Key Configuration:**

| Setting | Value |
|---------|-------|
| Host | `0.0.0.0` (all interfaces) |
| Port | `8000` |
| CORS | Enabled for all origins |
| Model loading | Once at startup (cached) |
| Prediction storage | MongoDB `predictions` collection |

### 2. Model Loader (`model_loader.py`)

Responsible for downloading and loading the ML model:

- Connects to MongoDB Atlas using credentials from `.env`
- Downloads `batter_risk_model.pkl` from GridFS
- Deserializes with `joblib`
- Caches the model in memory (singleton pattern)
- Prints model type and size on load

### 3. Model Uploader (`upload_model.py`)

One-time utility to upload the model file to MongoDB Atlas GridFS:

- Reads `batter_risk_model.pkl` from disk
- Uploads with metadata (filename, model name, version, timestamp, file size)
- Verifies the upload by reading it back
- Run once: `python upload_model.py`

### 4. Web UI (`static/index.html`)

A single-page web application with:

- **Glassmorphism design** — dark gradient background with blurred glass container
- **Three input fields** with synchronized sliders:
  - Hours Since Manufacturing (0–72h slider, 0–200 input)
  - Storage Temperature (0–60°C slider, -40–60°C input)
  - Sell-Through Rate (0–100% slider, 0–1 input)
- **Real-time API health status** (green/red dot)
- **Animated result display** with:
  - Risk badge (Low/Medium/High)
  - Confidence bars with percentage values
  - Smooth fade-in animation
- **Keyboard support** — Enter key triggers prediction
- **Input validation** — client-side checks before API call
- **Loading state** — spinner while prediction is in progress

### 5. Node.js Data Scripts

#### `pull-data.js`
- Connects to MongoDB Atlas
- Discovers the `sample_mflix` database
- Exports all collections as JSON files to `data/sample_mflix/`
- Handles DNS SRV resolution on Windows

#### `test-connection.js`
- Tests MongoDB Atlas connectivity
- Lists all databases with sizes
- Pings the cluster
- Useful for verifying credentials before running Python scripts

---

## Model Details

| Property | Value |
|----------|-------|
| **Type** | `RandomForestClassifier` |
| **Library** | scikit-learn 1.6.1 |
| **Serialization** | `joblib` |
| **Parameters** | `max_depth=6`, `class_weight=balanced`, `n_estimators=100` |
| **Features (3)** | `hours_since_mfg`, `storage_temp`, `sell_through_rate` |
| **Classes (3)** | `Low Risk`, `Medium Risk`, `High Risk` |
| **Supports** | `predict()` and `predict_proba()` |

### Feature Importances

| Feature | Importance | Description |
|---------|------------|-------------|
| `hours_since_mfg` | 0.5824 | Time since manufacture — dominant factor |
| `storage_temp` | 0.3963 | Storage temperature — accelerates fermentation |
| `sell_through_rate` | 0.0212 | Sales velocity — business risk factor |

### Input/Output Schema

**Request:**
```json
{
    "hours_since_mfg": 12.0,
    "storage_temp_c": 27.0,
    "sell_through_rate": 0.5
}
```

**Response:**
```json
{
    "success": true,
    "prediction": "Low Risk",
    "confidence": {
        "High Risk": 0.0467,
        "Low Risk": 0.5042,
        "Medium Risk": 0.4490
    }
}
```

> **Note:** The field name `storage_temp_c` (input) maps to `storage_temp` (model feature). This mapping is handled automatically in `app.py`.

---

## Setup & Installation

### Prerequisites

- Python 3.10+
- Node.js 16+ (for data scripts)
- MongoDB Atlas account with a cluster
- `batter_risk_model.pkl` and `input.json` in the project directory

### 1. Python Environment

```bash
cd battery-risk-ml
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

### 2. Node.js Environment

```bash
npm install
```

### 3. Configure Credentials

**Python (`.env`):**
```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGODB_DATABASE=battery_risk
```

**Node.js (`atlas-credentials.env`):**
```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
```

### 4. Upload Model to MongoDB (one-time)

```bash
cd battery-risk-ml
python upload_model.py
```

Expected output:
```
MongoDB Atlas connected
Uploading model...
Model uploaded successfully
GridFS file ID: <id>
Verified: batter_risk_model.pkl (630209 bytes)
```

### 5. Start the Server

```bash
cd battery-risk-ml
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

The server will:
1. Download the model from MongoDB GridFS (~630 KB)
2. Verify MongoDB connection
3. Start listening on port 8000

---

## Usage

### Web UI

Open [http://localhost:8000](http://localhost:8000) in your browser.

1. Enter battery parameters (or use the sliders)
2. Click **Run Prediction**
3. View the risk assessment with confidence bars

### API (cURL)

```bash
# Health check
curl http://localhost:8000/health

# Run prediction
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"hours_since_mfg": 12, "storage_temp_c": 27, "sell_through_rate": 0.5}'
```

### Swagger UI

Visit [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation.

### CLI Testing

```bash
cd battery-risk-ml
python test_model.py
```

Runs all 20 test cases from `input.json` and prints pass/fail results.

---

## API Reference

### `GET /`

Serves the Web UI (HTML).

### `GET /health`

Health check endpoint.

**Response:**
```json
{
    "status": "ok",
    "mongodb": "connected",
    "model": "loaded"
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `status` | `"ok"` | Always `"ok"` if server is running |
| `mongodb` | `"connected"` / `"disconnected"` | MongoDB Atlas connection status |
| `model` | `"loaded"` / `"not loaded"` | ML model status |

### `POST /predict`

Run a battery risk prediction and store results in MongoDB.

**Request Body:**

| Field | Type | Min | Max | Required | Description |
|-------|------|-----|-----|----------|-------------|
| `hours_since_mfg` | float | 0 | — | Yes | Hours since manufacture |
| `storage_temp_c` | float | -40 | 60 | Yes | Storage temperature (°C) |
| `sell_through_rate` | float | 0.0 | 1.0 | Yes | Sell-through rate (0–1) |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | `true` if prediction succeeded |
| `prediction` | string | `"Low Risk"` / `"Medium Risk"` / `"High Risk"` |
| `confidence` | object | Probability per class (sums to ~1.0) |

**Error Responses:**

| Status | Cause |
|--------|-------|
| `422` | Invalid input (validation error) |
| `503` | Model not loaded yet |

### `GET /docs`

Swagger UI (auto-generated by FastAPI).

---

## Web UI

### Features

| Feature | Description |
|---------|-------------|
| **Glassmorphism design** | Modern dark theme with blur effects |
| **Responsive** | Works on desktop and mobile |
| **Input validation** | Client-side checks before API call |
| **Slider sync** | Sliders and number inputs stay in sync |
| **Loading state** | Spinner during prediction |
| **Animated results** | Confidence bars animate on load |
| **Error handling** | Clear error messages for bad inputs |
| **Keyboard shortcuts** | Enter key triggers prediction |
| **Health indicator** | Green/red dot shows API status |

### Input Fields

| Field | Slider Range | Input Range | Step | Unit |
|-------|-------------|-------------|------|------|
| Hours Since Mfg | 0–72 | 0–200 | 0.1 | hrs |
| Storage Temp | 0–60 | -40–60 | 0.1 | °C |
| Sell-Through Rate | 0–100% | 0–1 | 0.01 | 0–1 |

### Design

- **Background:** Linear gradient (`#0f0c29` → `#302b63` → `#24243e`)
- **Container:** Glass effect with `backdrop-filter: blur(20px)`
- **Accent color:** Purple (`#7c5cfc`)
- **Risk colors:** Green (`#22c55e`), Yellow (`#eab308`), Red (`#ef4444`)

---

## Data Pipeline

### MongoDB Atlas GridFS

The ML model (~630 KB) is stored in MongoDB Atlas using GridFS:

| Property | Value |
|----------|-------|
| **Database** | `battery_risk` |
| **GridFS collection** | `fs.files` / `fs.chunks` |
| **Filename** | `batter_risk_model.pkl` |
| **Model name** | `batter_risk_model` |
| **Version** | `1` |

### Predictions Collection

Each prediction is stored in `battery_risk.predictions`:

```json
{
    "model_name": "batter_risk_model",
    "model_version": "1",
    "input": {
        "hours_since_mfg": 12,
        "storage_temp_c": 27,
        "sell_through_rate": 0.5
    },
    "prediction": "High Risk",
    "confidence": {
        "High Risk": 0.9376,
        "Low Risk": 0.0344,
        "Medium Risk": 0.0279
    },
    "created_at": "2026-08-19T12:00:00.000Z"
}
```

### Node.js Data Scripts

| Script | Purpose | Command |
|--------|---------|---------|
| `pull-data.js` | Export sample_mflix collections to JSON | `node pull-data.js` |
| `test-connection.js` | Test MongoDB Atlas connectivity | `npm run test-db` |

---

## Test Suite

### Test Cases (`input.json`)

20 test cases covering diverse scenarios:

| ID | Scenario | Hours | Temp | Sell Rate | Expected |
|----|----------|-------|------|-----------|----------|
| 1 | Fresh, room temp, fast sales | 4 | 27°C | 0.9 | Low Risk |
| 2 | Fresh, room temp, slow sales | 6 | 27°C | 0.1 | Low Risk |
| 3 | 12h old, room temp, avg sales | 12 | 27°C | 0.5 | Low Risk |
| 4 | 18h old, room temp, slow sales | 18 | 27°C | 0.2 | Medium Risk |
| 5 | 24h old, room temp, avg sales | 24 | 27°C | 0.5 | Medium Risk |
| 6 | 24h old, room temp, fast sales | 24 | 27°C | 0.95 | Low Risk |
| 7 | 30h old, room temp, avg sales | 30 | 27°C | 0.4 | High Risk |
| 8 | 36h old, room temp, fast sales | 36 | 27°C | 0.8 | High Risk |
| 9 | 48h old, room temp, dead zone | 48 | 27°C | 0.3 | High Risk |
| 10 | 12h old, HOT (32°C), avg sales | 12 | 32°C | 0.5 | Medium Risk |
| 11 | 18h old, HOT (32°C), slow sales | 18 | 32°C | 0.15 | High Risk |
| 12 | 24h old, HOT (32°C), fast sales | 24 | 32°C | 0.9 | High Risk |
| 13 | 24h old, FRIDGE (4°C), slow sales | 24 | 4°C | 0.2 | Low Risk |
| 14 | 48h old, FRIDGE (4°C), avg sales | 48 | 4°C | 0.5 | Medium Risk |
| 15 | 72h old, FRIDGE (4°C), slow sales | 72 | 4°C | 0.1 | High Risk |
| 16 | Extreme Cold (0°C), 24h | 24 | 0°C | 0.3 | Low Risk |
| 17 | Extreme Heat (40°C), 8h | 8 | 40°C | 0.4 | High Risk |
| 18 | Super-fast turnover (1.0), 30h | 30 | 27°C | 1.0 | Low Risk |
| 19 | Dead stock (0.01), 15h | 15 | 27°C | 0.01 | Medium Risk |
| 20 | Perfect batch (Fresh+Cold+Fast) | 2 | 4°C | 0.95 | Low Risk |

### Running Tests

```bash
cd battery-risk-ml
python test_model.py
```

Each test case includes a scientific explanation of the expected risk level based on pH levels and fermentation dynamics.

---

## Dependencies

### Python (`requirements.txt`)

| Package | Purpose |
|---------|---------|
| `pymongo[srv]` | MongoDB driver with DNS SRV support |
| `python-dotenv` | Load `.env` files |
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `joblib` | Model deserialization |
| `scikit-learn` | ML framework (RandomForestClassifier) |
| `numpy` | Numerical arrays |

### Node.js (`package.json`)

| Package | Purpose |
|---------|---------|
| `mongodb` | MongoDB driver |
| `dotenv` | Load environment variables |

---

## Troubleshooting

### Model version warning

```
InconsistentVersionWarning: Trying to unpickle estimator from version 1.6.1 when using version 1.9.0
```

**Safe to ignore.** The model loads and works correctly. To suppress, install scikit-learn 1.6.1:

```bash
pip install scikit-learn==1.6.1
```

### Feature name warning

```
UserWarning: X does not have valid feature names, but RandomForestClassifier was fitted with feature names
```

Harmless — predictions use NumPy arrays. Can be ignored.

### MongoDB connection fails

1. Verify `MONGODB_URI` in `.env` is correct
2. Check your Atlas cluster is running
3. Ensure your IP is whitelisted in Atlas **Network Access**
4. Verify database user credentials in Atlas **Database Access**
5. Run `npm run test-db` to test connectivity

### GridFS model not found

Run the upload script:

```bash
cd battery-risk-ml
python upload_model.py
```

### Port 8000 already in use

```bash
# Find and kill the process using port 8000
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Or use a different port
python -m uvicorn app:app --port 8001
```

### Windows DNS SRV resolution issues

The Node.js scripts include a fix for Windows:

```javascript
dns.setServers(['8.8.8.8', '1.1.1.1']);
```

If this doesn't work, try running from Git Bash or WSL.

---

## Security

- **Never commit** `.env` or `atlas-credentials.env` to version control
- MongoDB credentials are loaded via `python-dotenv`, not hardcoded
- The API does not expose `MONGODB_URI` in responses
- GridFS stores the model binary, not human-readable text
- `.gitignore` excludes: `.env`, `venv/`, `__pycache__/`, `*.pyc`, `*.pyo`, `.Python`, `*.egg-info/`, `dist/`, `build/`
