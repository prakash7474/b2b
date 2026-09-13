"""
Prediction history & statistics routes for B2P Backend.
ML inference routes live in backend/services/demand.py and backend/services/spoilage.py.
"""

from datetime import datetime
from flask import request, jsonify
from backend.config import app
from backend.database import COLS


# ==============================================================================
# ROUTE: GET /api/history
# ==============================================================================
@app.route("/api/history", methods=["GET"])
def get_history():
    limit = int(request.args.get("limit", 50))
    cursor = COLS["predictions"].find({}).sort("generatedAt", -1).limit(limit)
    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("generatedAt"), datetime):
            doc["generatedAt"] = doc["generatedAt"].isoformat()
        if isinstance(doc.get("date"), datetime):
            doc["date"] = doc["date"].isoformat()
        results.append(doc)
    return jsonify(results)


# ==============================================================================
# ROUTE: GET /api/stats
# ==============================================================================
@app.route("/api/stats", methods=["GET"])
def get_stats():
    total = COLS["predictions"].count_documents({})
    demand_count = COLS["predictions"].count_documents({"predictionType": "DEMAND"})
    spoilage_count = COLS["predictions"].count_documents({"predictionType": "SPOILAGE_RISK"})
    return jsonify({
        "totalPredictions": total,
        "demandPredictions": demand_count,
        "spoilagePredictions": spoilage_count,
    })
