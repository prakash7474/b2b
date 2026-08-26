"""
Upload batter_risk_model.pkl to MongoDB Atlas using GridFS.
"""

import os
import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
from gridfs import GridFS

load_dotenv()

MODEL_FILENAME = "batter_risk_model.pkl"
MODEL_NAME = "batter_risk_model"
MODEL_VERSION = "1"


def get_db():
    uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("MONGODB_DATABASE", "battery_risk")
    client = MongoClient(uri)
    return client[db_name]


def upload_model():
    print("MongoDB Atlas connected")
    db = get_db()
    fs = GridFS(db)

    file_path = os.path.join(os.path.dirname(__file__), MODEL_FILENAME)
    if not os.path.exists(file_path):
        print(f"ERROR: {MODEL_FILENAME} not found at {file_path}")
        return None

    file_size = os.path.getsize(file_path)

    print("Uploading model...")
    with open(file_path, "rb") as f:
        file_id = fs.put(
            f,
            filename=MODEL_FILENAME,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            upload_time=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            file_size=file_size,
        )

    print(f"Model uploaded successfully")
    print(f"GridFS file ID: {file_id}")

    # Verify upload
    grid_file = fs.find_one({"filename": MODEL_FILENAME})
    if grid_file:
        print(f"Verified: {grid_file.filename} ({grid_file.length} bytes)")
    else:
        print("WARNING: Could not verify upload")

    return file_id


if __name__ == "__main__":
    upload_model()
