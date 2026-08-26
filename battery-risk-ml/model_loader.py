"""
Download and load batter_risk_model.pkl from MongoDB Atlas GridFS.
The model is loaded once and cached in memory.
"""

import os
import io
import joblib
from dotenv import load_dotenv
from pymongo import MongoClient
from gridfs import GridFS

load_dotenv()

MODEL_FILENAME = "batter_risk_model.pkl"

_model_cache = None


def get_db():
    uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("MONGODB_DATABASE", "battery_risk")
    client = MongoClient(uri)
    return client[db_name]


def download_model():
    """Download the model from MongoDB Atlas GridFS."""
    print("Connecting to MongoDB Atlas...")
    db = get_db()

    fs = GridFS(db)

    grid_file = fs.find_one({"filename": MODEL_FILENAME})
    if grid_file is None:
        raise FileNotFoundError(
            f"{MODEL_FILENAME} not found in MongoDB Atlas GridFS. "
            "Run upload_model.py first."
        )

    print(f"Found model in GridFS (file ID: {grid_file._id})")
    print(f"File size: {grid_file.length} bytes")

    model_data = grid_file.read()

    return model_data


def load_model():
    """Load the model from MongoDB Atlas GridFS into RAM (cached)."""
    global _model_cache

    if _model_cache is not None:
        return _model_cache

    print("Loading batter_risk_model.pkl...")
    model_data = download_model()

    # The model was saved with joblib, load with joblib
    model = joblib.load(io.BytesIO(model_data))

    print(f"Model loaded successfully ({type(model).__name__})")
    _model_cache = model
    return _model_cache
