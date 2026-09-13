import traceback
from datetime import datetime, timedelta

from flask import request, jsonify

import backend.database as _db
from backend.database import jsonify_doc, log_event
from backend.config import app


# ── Weather forecast lookup (Phase B) ────────────────────────────────
# ==============================================================================
# FUNCTION: get_weather_for_date(target_date)
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Fetches expected ambient temperature (°C) and rain probability (0.0 to 1.0)
#   for a target prediction date.
#
# HOW IT WORKS:
#   1. Queries `COLS["weather_forecast"]` for forecasts covering target_date's full 24-hr day.
#   2. Sorts descending by `forecastIssuedAt` to retrieve the most recent weather bulletin.
#   3. Resilient Fallback: If no forecast is found in MongoDB, it applies domain-specific
#      Chennai seasonal climate defaults:
#        - Monsoon (June - November): 29°C, 55% rain probability.
#        - Mild Winter (December - February): 26°C, 10% rain probability.
#        - Summer (March - May): 35°C, 5% rain probability.
#
# INSTRUCTOR VIVA POINT:
#   Q: "Why does weather affect both demand and spoilage models?"
#   A: "Higher ambient temperatures accelerate microbial fermentation in batter,
#      rapidly increasing lactic acid and lowering pH. Rainy days increase home
#      cooking and hot tiffin consumption, shifting batter demand upward."
# ==============================================================================
def get_weather_for_date(target_date):
    """Return (temperatureC: float, rain_probability: float) for a given date.
    Reads from weather_forecast collection; falls back to Chennai seasonal defaults
    if no forecast is available.
    """
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end   = day_start + timedelta(hours=23, minutes=59)
    doc = _db.COLS["weather_forecast"].find_one(
        {"forecastFor": {"$gte": day_start, "$lte": day_end}},
        sort=[("forecastIssuedAt", -1)]
    )
    if doc:
        return float(doc.get("temperatureC", 31.0)), float(doc.get("rainProbability", 0.2))
    # Chennai seasonal defaults by month
    month = target_date.month
    if month in (6, 7, 8, 9, 10, 11):   # monsoon
        return 29.0, 0.55
    elif month in (12, 1, 2):            # mild winter
        return 26.0, 0.10
    else:                                # summer
        return 35.0, 0.05


@app.route("/api/weather-forecast", methods=["GET"])
def get_weather_forecast():
    """Return weather forecast records. Optionally filter by date (YYYY-MM-DD)."""
    date_str = request.args.get("date")
    query = {}
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d")
            query["forecastFor"] = {"$gte": day, "$lte": day + timedelta(hours=23, minutes=59)}
        except Exception:
            pass
    docs = list(_db.COLS["weather_forecast"].find(query).sort("forecastIssuedAt", -1).limit(30))
    return jsonify([jsonify_doc(d) for d in docs])


# ==============================================================================
# ROUTE: POST /api/weather-forecast
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Allows an administrator to manually inject or override weather forecast data
#   (e.g., in case of unexpected heat waves or sudden cyclonic rainfall).
#
# VALIDATION RULES:
#   - `rainProbability`: strictly bounded between 0.0 and 1.0.
#   - `temperatureC`: strictly bounded between -10.0°C and 55.0°C.
#   - Upserts into `COLS["weather_forecast"]` with `source="manual_override"`.
# ==============================================================================
@app.route("/api/weather-forecast", methods=["POST"])
def set_weather_forecast():
    """Admin manual override: create or update a weather forecast for a given date."""
    try:
        data = request.json or {}
        date_str = data.get("date") or data.get("forecastFor")
        if not date_str:
            return jsonify({"error": "date (YYYY-MM-DD) is required"}), 400
        try:
            forecast_for = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
        except Exception:
            return jsonify({"error": "Invalid date format — use YYYY-MM-DD"}), 400

        temp_c = float(data.get("temperatureC", 31.0))
        rain_prob = float(data.get("rainProbability", 0.2))
        if not (0.0 <= rain_prob <= 1.0):
            return jsonify({"error": "rainProbability must be 0.0–1.0"}), 400
        if not (-10.0 <= temp_c <= 55.0):
            return jsonify({"error": "temperatureC out of valid range (-10 to 55)"}), 400

        now = datetime.utcnow()
        doc = {
            "locationGridKey": data.get("locationGridKey", "chennai_central"),
            "forecastIssuedAt": now,
            "forecastFor": forecast_for,
            "temperatureC": temp_c,
            "rainProbability": rain_prob,
            "humidityPct": float(data.get("humidityPct", 70.0)),
            "source": "manual_override",
        }
        # Upsert: replace existing forecast for this date+location
        result = _db.COLS["weather_forecast"].update_one(
            {
                "forecastFor": forecast_for,
                "locationGridKey": doc["locationGridKey"],
                "source": "manual_override",
            },
            {"$set": doc},
            upsert=True
        )
        log_event("activity", "info", "Admin",
                  f"Weather forecast set for {date_str}: {temp_c}°C, rain={rain_prob*100:.0f}%",
                  {"type": "system", "id": "WEATHER_FORECAST", "name": "Weather Forecast"})
        return jsonify({"ok": True, "upserted": result.upserted_id is not None})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400
