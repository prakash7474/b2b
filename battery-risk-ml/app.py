"""
FastAPI server for Battery Risk ML Prediction System.

GET  /health  - Health check
POST /predict - Run ML prediction and store results in MongoDB
"""

import os
import datetime
import numpy as np
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from pymongo import MongoClient
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from model_loader import load_model

load_dotenv()

# ─── Pydantic models ───────────────────────────────────────────────


class PredictionInput(BaseModel):
    hours_since_mfg: float = Field(..., description="Hours since manufacturing")
    storage_temp_c: float = Field(..., description="Storage temperature in Celsius")
    sell_through_rate: float = Field(..., description="Sell-through rate (0.0 to 1.0)")


class PredictionResponse(BaseModel):
    success: bool
    prediction: str
    confidence: dict


class HealthResponse(BaseModel):
    status: str
    mongodb: str
    model: str


# ─── Globals ────────────────────────────────────────────────────────

_model = None
_client = None
_db = None


def get_db():
    global _client, _db
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        db_name = os.getenv("MONGODB_DATABASE", "battery_risk")
        _client = MongoClient(uri)
        _db = _client[db_name]
    return _db


# ─── Lifespan: load model once at startup ───────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    _model = load_model()
    # Verify MongoDB connection
    get_db()
    print("FastAPI server ready. Listening for requests...")
    yield
    print("Shutting down...")


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Battery Risk ML Prediction API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Serve UI ───────────────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
def serve_ui():
    ui_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    with open(ui_path, "r") as f:
        return HTMLResponse(content=f.read())


# ─── Routes ─────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
def health_check():
    mongodb_status = "disconnected"
    model_status = "not loaded"
    try:
        get_db().command("ping")
        mongodb_status = "connected"
    except Exception:
        pass
    if _model is not None:
        model_status = "loaded"
    return HealthResponse(status="ok", mongodb=mongodb_status, model=model_status)


@app.post("/predict", response_model=PredictionResponse)
def predict(input_data: PredictionInput):
    global _model

    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    # Map input.json field names to model feature names
    # input.json uses "storage_temp_c" but model expects "storage_temp"
    features = np.array(
        [[input_data.hours_since_mfg, input_data.storage_temp_c, input_data.sell_through_rate]]
    )

    # Run prediction
    prediction = _model.predict(features)[0]

    # Get confidence/probability
    proba = _model.predict_proba(features)[0]
    classes = list(_model.classes_)
    confidence = {cls: round(float(prob), 4) for cls, prob in zip(classes, proba)}

    # Store input + prediction in MongoDB
    db = get_db()
    db.predictions.insert_one(
        {
            "model_name": "batter_risk_model",
            "model_version": "1",
            "input": input_data.model_dump(),
            "prediction": prediction,
            "confidence": confidence,
            "created_at": datetime.datetime.now(datetime.timezone.utc),
        }
    )

    return PredictionResponse(
        success=True,
        prediction=prediction,
        confidence=confidence,
    )
