from datetime import datetime, timedelta

from flask import request, jsonify

import backend.database as _db
from backend.database import jsonify_doc
from backend.config import app


# ── Festival calendar lookup (Phase B) ────────────────────────────────
# ==============================================================================
# FUNCTION: get_festival_context(target_date)
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Checks whether `target_date` falls within ±2 days of any registered festival
#   in the `festival_calendar` MongoDB collection.
#
# HOW IT WORKS:
#   1. Builds a 5-day search window: from [target_date - 2 days] to [target_date + 2 days].
#      Looking ±2 days accounts for pre-festival preparation buying and post-festival holidays.
#   2. Queries MongoDB collection `COLS["festival_calendar"]` using a range query:
#      {"date": {"$gte": window_start, "$lte": window_end}}.
#   3. If found: returns (1, festivalType). If no festival matches: returns (0, "none").
#
# INSTRUCTOR VIVA POINT:
#   Q: "Why check ±2 days instead of just the exact holiday date?"
#   A: "Households purchase batter 1-2 days before festivals to prepare breakfasts,
#      and extended holiday weekends prolong peak batter consumption."
# ==============================================================================
def get_festival_context(target_date):
    """Return (is_festival: int, festival_type: str) for a given date.
    Looks ±2 days around target_date in the festival_calendar collection.
    """
    window_start = datetime(target_date.year, target_date.month, target_date.day) - timedelta(days=2)
    window_end   = datetime(target_date.year, target_date.month, target_date.day) + timedelta(days=2, hours=23, minutes=59)
    doc = _db.COLS["festival_calendar"].find_one({
        "date": {"$gte": window_start, "$lte": window_end}
    }, sort=[("date", 1)])
    if doc:
        return 1, doc.get("festivalType", "publicHoliday")
    return 0, "none"


# ── Festival calendar seed (Phase B) ────────────────────────────────
# ==============================================================================
# FUNCTION: seed_festival_calendar()
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Pre-populates MongoDB `festival_calendar` with official government holidays
#   and cultural festivals for Tamil Nadu and National India across 2026-2027.
#
# IDEMPOTENCY:
#   Checks `COLS["festival_calendar"].count_documents({}) > 0` before inserting.
#   If documents already exist, it immediately returns to avoid duplicate seeds.
# ==============================================================================
def seed_festival_calendar():
    """One-time seed of Tamil Nadu + national festival calendar (2026-2027)."""
    if _db.COLS["festival_calendar"].count_documents({}) > 0:
        return  # already seeded

    festivals = [
        # 2026 festivals
        {"date": datetime(2026, 1, 14), "festivalType": "harvestFestival",  "festivalName": "Pongal Day 1 (Bhogi)",    "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 15), "festivalType": "harvestFestival",  "festivalName": "Pongal",                  "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 16), "festivalType": "harvestFestival",  "festivalName": "Mattu Pongal",            "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 17), "festivalType": "harvestFestival",  "festivalName": "Kaanum Pongal",           "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2026, 1, 26), "festivalType": "publicHoliday",    "festivalName": "Republic Day",            "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 4, 14), "festivalType": "publicHoliday",    "festivalName": "Tamil New Year",          "region": "Tamil Nadu", "windowDays": 2},
        {"date": datetime(2026, 7, 28), "festivalType": "harvestFestival",  "festivalName": "Aadi Perukku",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 8, 15), "festivalType": "publicHoliday",    "festivalName": "Independence Day",        "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 9, 2),  "festivalType": "publicHoliday",    "festivalName": "Ganesh Chaturthi",        "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 10, 2), "festivalType": "publicHoliday",    "festivalName": "Gandhi Jayanti",          "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 10, 14),"festivalType": "publicHoliday",    "festivalName": "Navarathri Day 1",        "region": "Tamil Nadu", "windowDays": 9},
        {"date": datetime(2026, 10, 22),"festivalType": "publicHoliday",    "festivalName": "Vijayadasami",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 11, 10),"festivalType": "publicHoliday",    "festivalName": "Diwali",                  "region": "National",   "windowDays": 2},
        {"date": datetime(2026, 11, 30),"festivalType": "publicHoliday",    "festivalName": "Karthigai Deepam",        "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2026, 12, 25),"festivalType": "publicHoliday",    "festivalName": "Christmas",               "region": "National",   "windowDays": 1},
        {"date": datetime(2026, 12, 31),"festivalType": "publicHoliday",    "festivalName": "New Year Eve",            "region": "National",   "windowDays": 2},
        # 2027 festivals
        {"date": datetime(2027, 1, 1),  "festivalType": "publicHoliday",    "festivalName": "New Year",                "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 1, 14), "festivalType": "harvestFestival",  "festivalName": "Pongal Day 1 (Bhogi)",    "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 15), "festivalType": "harvestFestival",  "festivalName": "Pongal",                  "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 16), "festivalType": "harvestFestival",  "festivalName": "Mattu Pongal",            "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 17), "festivalType": "harvestFestival",  "festivalName": "Kaanum Pongal",           "region": "Tamil Nadu", "windowDays": 4},
        {"date": datetime(2027, 1, 26), "festivalType": "publicHoliday",    "festivalName": "Republic Day",            "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 4, 14), "festivalType": "publicHoliday",    "festivalName": "Tamil New Year",          "region": "Tamil Nadu", "windowDays": 2},
        {"date": datetime(2027, 7, 27), "festivalType": "harvestFestival",  "festivalName": "Aadi Perukku",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2027, 8, 15), "festivalType": "publicHoliday",    "festivalName": "Independence Day",        "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 10, 2), "festivalType": "publicHoliday",    "festivalName": "Gandhi Jayanti",          "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 10, 22),"festivalType": "publicHoliday",    "festivalName": "Navarathri Day 1",        "region": "Tamil Nadu", "windowDays": 9},
        {"date": datetime(2027, 10, 30),"festivalType": "publicHoliday",    "festivalName": "Vijayadasami",            "region": "Tamil Nadu", "windowDays": 1},
        {"date": datetime(2027, 10, 28),"festivalType": "publicHoliday",    "festivalName": "Diwali",                  "region": "National",   "windowDays": 2},
        {"date": datetime(2027, 12, 25),"festivalType": "publicHoliday",    "festivalName": "Christmas",               "region": "National",   "windowDays": 1},
        {"date": datetime(2027, 12, 31),"festivalType": "publicHoliday",    "festivalName": "New Year Eve",            "region": "National",   "windowDays": 2},
    ]
    try:
        _db.COLS["festival_calendar"].insert_many(festivals, ordered=False)
        print(f"  [OK] Festival calendar seeded with {len(festivals)} events")
    except Exception as e:
        print(f"  [WARN] Festival calendar seed partial: {e}")


try:
    seed_festival_calendar()
except Exception:
    pass


# ════════════════════════════════════════════════════════════════════
# FESTIVAL CALENDAR SERVICE
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: GET /api/festival-calendar
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Returns upcoming cultural and public holiday dates used by the ML demand engine.
#   Optional query filter `region` (e.g. "Tamil Nadu" or "National").
# ==============================================================================
@app.route("/api/festival-calendar", methods=["GET"])
def get_festival_calendar():
    """Return all upcoming festival events. Optionally filter by region."""
    region = request.args.get("region")
    query = {}
    if region:
        query["region"] = region
    docs = list(_db.COLS["festival_calendar"].find(query).sort("date", 1))
    return jsonify([jsonify_doc(d) for d in docs])
