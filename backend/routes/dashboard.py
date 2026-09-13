"""
Dashboard & Logs routes for B2P Backend.
Extracted from app.py — handles admin dashboard summary and audit log endpoints.
"""

from datetime import datetime, timedelta
from flask import request, jsonify, session
from pymongo import DESCENDING
import pandas as pd
from backend.config import app
from backend.auth import _get_authenticated_user
import backend.database as _db
from backend.database import (
    log_event, write_movement, sync_vendor_inventory_with_batches,
    jsonify_doc, parse_date,
)
from backend.services.constants import safe_encode


# ==============================================================================
# ROUTE: GET /  (Health Check)
# ==============================================================================
@app.route("/")
def index():
    return "B2P Backend is running. API docs at /api/vendors, /api/batches, etc."


# ==============================================================================
# ROUTE: GET /api/dashboard & GET /api/dashboard/summary
# ------------------------------------------------------------------------------
@app.route("/api/dashboard", methods=["GET"])
@app.route("/api/dashboard/summary", methods=["GET"])
def dashboard():
    from backend.services.demand import compute_sales_features, demand_model, demand_features
    from backend.services.spoilage import spoilage_model, spoilage_features, label_encoder, storage_encoder, KNOWN_STORAGE
    from backend.services.weather import get_weather_for_date
    from backend.services.festivals import get_festival_context

    user = _get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    if user.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    vendors_col = _db.COLS["vendors"]
    batches_col = _db.COLS["batches"]
    inventory_col = _db.COLS["inventory"]
    orders_col = _db.COLS["orders"]
    predictions_col = _db.COLS["predictions"]

    # ── 1. Fleet Vendor & Batch Status Counts ──────────────────────────────────
    active_vendors = vendors_col.count_documents({
        "verificationStatus": {"$nin": ["rejected", "terminated"]}
    })
    total_batches = batches_col.count_documents({})
    assigned_batches = batches_col.count_documents({"status": "assigned"})
    received_batches = batches_col.count_documents({"status": "received"})
    delivered_batches = received_batches or orders_col.count_documents({"order_status": "completed"})

    # ── 2. Inventory Breakdown: Central Kitchen vs Retail Partner Stores ───────
    # Central Kitchen stock = batches produced at hub not yet dispatched to any vendor
    central_batches = list(batches_col.find({
        "status": "created",
        "$or": [{"vendor_id": None}, {"vendor_id": ""}, {"vendor_id": {"$exists": False}}]
    }))
    central_stock = round(sum(float(b.get("volume_kg", b.get("quantity_kg", 0))) for b in central_batches), 1)

    # Partner Store stock = active retail shelf stock recorded in inventory ledger
    stock_agg = list(inventory_col.aggregate(
        [{"$group": {"_id": None, "qty": {"$sum": "$quantity"}}}]
    ))
    partner_stock = round(stock_agg[0]["qty"], 1) if stock_agg else 0
    total_stock = round(central_stock + partner_stock, 1)

    # Low stock alert count: stores where on-hand quantity <= minimum buffer threshold
    low_stock = inventory_col.count_documents({
        "$expr": {"$lte": ["$quantity", {"$ifNull": ["$minimumStock", "$minimum_stock"]}]}
    })

    # ── 3. 7-Day Actual Sales Trend from Historical Orders ──────────────────────
    now = datetime.utcnow()
    trend_7day = []
    # Pre-fetch order items & orders for the last 7 days to calculate actual sales per day
    start_7d = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    recent_orders_7d = list(orders_col.find({"order_date": {"$gte": start_7d}}, {"order_id": 1, "order_date": 1}))
    order_id_map_7d = {o["order_id"]: o["order_date"] for o in recent_orders_7d}
    items_7d = list(_db.COLS["order_items"].find({"order_id": {"$in": list(order_id_map_7d.keys())}}, {"order_id": 1, "quantity": 1})) if order_id_map_7d else []
    
    daily_actuals = {}
    for it in items_7d:
        o_date = order_id_map_7d.get(it["order_id"])
        if isinstance(o_date, str):
            o_date = parse_date(o_date)
        if o_date:
            d_key = o_date.strftime("%Y-%m-%d")
            daily_actuals[d_key] = daily_actuals.get(d_key, 0.0) + float(it.get("quantity", 0))

    # ── 4. High-Performance Bulk Pre-fetch for ML Inference ────────────────────
    # Avoids N+1 query overhead by pre-loading all relevant datasets into memory
    active_vendors_list = list(vendors_col.find({"verificationStatus": "active"}))
    vids = [v.get("vendor_id") for v in active_vendors_list if v.get("vendor_id")]
    vendors_by_id = {v.get("vendor_id"): v for v in active_vendors_list}

    weather_curr = get_weather_for_date(now)
    festival_curr = get_festival_context(now)

    all_active_inv = list(inventory_col.find({"vendor_id": {"$in": vids}})) if vids else []
    inv_by_vendor = {}
    for item in all_active_inv:
        inv_by_vendor.setdefault(item.get("vendor_id"), []).append(item)

    all_received_batches = list(batches_col.find({"vendor_id": {"$in": vids}, "status": "received"})) if vids else []
    received_by_vendor = {}
    for b in all_received_batches:
        received_by_vendor.setdefault(b.get("vendor_id"), []).append(b)

    orders_limit = list(orders_col.find({"vendor_id": {"$in": vids}}).sort("order_date", -1).limit(400)) if vids else []
    orders_by_vendor = {}
    all_order_ids = []
    for o in orders_limit:
        orders_by_vendor.setdefault(o.get("vendor_id"), []).append(o)
        all_order_ids.append(o.get("order_id"))

    order_items_by_order = {}
    if all_order_ids:
        for it in _db.COLS["order_items"].find({"order_id": {"$in": all_order_ids}}, {"order_id": 1, "inventory_id": 1, "quantity": 1}):
            order_items_by_order.setdefault(it.get("order_id"), []).append(it)

    prefetched_context = {
        "vendors_by_id": vendors_by_id,
        "orders_by_vendor": orders_by_vendor,
        "inv_by_vendor": inv_by_vendor,
        "order_items_by_order": order_items_by_order,
        "received_by_vendor": received_by_vendor,
        "weather": weather_curr,
        "festival": festival_curr,
    }

    # ── 5. Real-Time Demand Prediction & Surge/Spike Detection ─────────────────
    vendor_predictions = {}
    top_spike_candidates = []
    for v in active_vendors_list:
        v_id = v.get("vendor_id")
        try:
            feat_dict, avail_stock, _ = compute_sales_features(v_id, "Idli Batter", now, "morning", prefetched=prefetched_context)
            row_df = pd.DataFrame([feat_dict])[demand_features]
            v_pred = max(0.0, round(float(demand_model.predict(row_df)[0]), 1))
            vendor_predictions[v_id] = v_pred
            rolling_base = max(5.0, feat_dict.get("rolling7DayMean", 15.0))
            # Surge spike calculation: percentage increase over normal weekly run-rate
            spike_pct = round(((v_pred - rolling_base) / rolling_base) * 100, 1)
            top_spike_candidates.append({
                "vendor_id": v_id,
                "shop_name": v.get("shop_name", v_id),
                "spikePct": spike_pct,
                "predictedKg": v_pred,
            })
        except Exception as e:
            print(f"[WARN] Failed spike prediction for {v_id}: {e}")

    # Sort descending by spike percentage to rank the most critical stores
    top_spike_candidates.sort(key=lambda x: (x["spikePct"], x["predictedKg"]), reverse=True)
    top_spike_vendors = top_spike_candidates[:5]
    total_active_pred = sum(vendor_predictions.values()) or 45.0

    # ── 6. 7-Day Demand Forecast Modulated by Day-of-Week & Festival ────────────
    fest_start = now - timedelta(days=9)
    fest_end = now + timedelta(days=3)
    fest_list = list(_db.COLS["festival_calendar"].find({"date": {"$gte": fest_start, "$lte": fest_end}}))

    def _is_fest_window(d):
        d_start = d - timedelta(days=2)
        d_end = d + timedelta(days=2, hours=23, minutes=59)
        for f in fest_list:
            f_date = f.get("date")
            if f_date and d_start <= f_date <= d_end:
                return True
        return False

    for i in range(7):
        day = now - timedelta(days=6 - i)
        d_key = day.strftime("%Y-%m-%d")
        actual_val = round(daily_actuals.get(d_key, 0.0), 1)

        # Apply domain multipliers: Saturday/Sunday peak (+15%), Monday dip (-8%)
        weekday_idx = day.weekday()
        wk_factor = 1.15 if weekday_idx in (5, 6) else (0.92 if weekday_idx == 0 else 1.0)
        is_fest = _is_fest_window(day)
        fest_factor = 1.25 if is_fest else 1.0
        pred_val = round(total_active_pred * wk_factor * fest_factor, 1)

        trend_7day.append({
            "date": day.strftime("%b %d"),
            "day": day.strftime("%a"),
            "predicted": pred_val,
            "actual": actual_val if actual_val > 0 else None,
        })

    # ── 7. Fleet Spoilage Risk Distribution (Live Random Forest Evaluation) ────
    active_batches = list(batches_col.find({"status": {"$in": ["received", "assigned"]}}).limit(50))
    green_c, amber_c, red_c = 0, 0, 0
    for b in active_batches:
        b_mfg = b.get("mfgTimestamp") or b.get("mfg_timestamp") or b.get("created_at") or now
        if isinstance(b_mfg, str):
            b_mfg = parse_date(b_mfg)
        b_hours = max(0.0, (now - b_mfg).total_seconds() / 3600.0)
        v_doc = vendors_by_id.get(b.get("vendor_id"))
        h_fridge = 1 if v_doc and v_doc.get("hasRefrigerator") else 0
        f_temp = v_doc.get("fridgeTemperatureC", 4.0) if v_doc and h_fridge else -1.0
        amb_temp = float(b.get("temperatureC", 30.0))
        st_type = v_doc.get("storageType", "counter") if v_doc else "counter"
        h_shelf = b_hours * 0.8
        h_exp = max(0.0, 72.0 - b_hours) if h_fridge else max(0.0, 24.0 - b_hours)
        t_exp = (f_temp if h_fridge else amb_temp) * b_hours

        # Assemble the 13 feature variables for the Random Forest Spoilage Classifier
        b_feat = {
            "initialPH": float(b.get("initialPH", 4.4)),
            "hoursSinceManufacture": round(b_hours, 1),
            "hasRefrigerator": h_fridge,
            "storageTypeEnc": safe_encode(storage_encoder, st_type, KNOWN_STORAGE),
            "ambientTemperatureC": amb_temp,
            "humidityPct": float(b.get("humidityPct", 60.0)),
            "fridgeTemperatureC": f_temp,
            "hoursOnShelf": round(h_shelf, 1),
            "sellThroughRate": 0.5,
            "effectiveTemperatureExposure": round(t_exp, 1),
            "hoursToExpiry": round(h_exp, 1),
            "volumeKg": float(b.get("volume_kg", 10.0)),
            "vendorRating": float(v_doc.get("rating", 4.0)) if v_doc else 4.0,
        }
        try:
            b_row = pd.DataFrame([b_feat])[spoilage_features]
            b_proba = spoilage_model.predict_proba(b_row)[0]
            r_map = {label_encoder.classes_[idx]: float(p) for idx, p in enumerate(b_proba)}
            # Classify by the label with highest probability
            pred_label = label_encoder.classes_[b_proba.argmax()]
            if pred_label == "Low":
                green_c += 1
            elif pred_label == "Medium":
                amber_c += 1
            else:
                red_c += 1
        except Exception:
            amber_c += 1

    spoilage_dist = {
        "green": max(0, green_c),
        "amber": max(0, amber_c),
        "red": max(0, red_c),
    }

    # ── 8. Vendor Requisitions & Seed Candidates ───────────────────────────────
    # Fetches unverified merchant applications for admin approval workflow
    pending_vendors = list(vendors_col.find({"verificationStatus": "pending"}))
    if not pending_vendors:
        seed_pending = [
            {
                "vendor_id": "V109_REQ",
                "shop_name": "Meenakshi Tiffin & Batter House",
                "owner_name": "S. Meenakshi Sundaram",
                "phone": "+91 98401 22345",
                "address": "14/2, 4th Main Road, Anna Nagar West, Chennai",
                "fssai_cert": "FSSAI-12423002000412",
                "verificationStatus": "pending",
                "localityTier": "commercial",
                "hasRefrigerator": True,
                "storageType": "fridge",
                "fridgeTemperatureC": 4.0,
                "rating": 4.5,
                "createdAt": datetime.utcnow() - timedelta(hours=3),
            },
            {
                "vendor_id": "V110_REQ",
                "shop_name": "Sri Krishna Pure Batter Outlet",
                "owner_name": "R. Krishnan",
                "phone": "+91 94440 98765",
                "address": "88, Bazaar Road, Mylapore, Chennai",
                "fssai_cert": "FSSAI-12424001000889",
                "verificationStatus": "pending",
                "localityTier": "residential_budget",
                "hasRefrigerator": False,
                "storageType": "counter",
                "fridgeTemperatureC": -1.0,
                "rating": 4.2,
                "createdAt": datetime.utcnow() - timedelta(hours=6),
            }
        ]
        for sp in seed_pending:
            existing = vendors_col.find_one({"vendor_id": sp["vendor_id"]})
            if existing and existing.get("verificationStatus") == "active" and not existing.get("localityTier"):
                vendors_col.update_one(
                    {"vendor_id": sp["vendor_id"]},
                    {"$set": {"verificationStatus": "pending", "localityTier": sp["localityTier"]}}
                )
            else:
                vendors_col.update_one({"vendor_id": sp["vendor_id"]}, {"$setOnInsert": sp}, upsert=True)
        pending_vendors = list(vendors_col.find({"verificationStatus": "pending"}))

    # ── 9. Monthly Production & Dispatch Velocity Metrics ──────────────────────
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    batches_this_month = list(batches_col.find({"created_at": {"$gte": month_start}}))
    dispatched_this_month = batches_col.count_documents({
        "status": {"$in": ["assigned", "received"]},
        "$or": [
            {"assigned_at": {"$gte": month_start}},
            {"created_at": {"$gte": month_start}},
        ]
    })
    total_batter_produced_kg = round(sum(b.get("volume_kg", 15.0) for b in batches_this_month), 1)

    # 4-week dispatch trend (dynamically aggregated from batch assignments)
    weekly_dispatch = []
    for w in range(4):
        w_start = now - timedelta(days=(4 - w) * 7)
        w_end = now - timedelta(days=(3 - w) * 7)
        w_count = batches_col.count_documents({
            "status": {"$in": ["assigned", "received"]},
            "$or": [
                {"assigned_at": {"$gte": w_start, "$lt": w_end}},
                {"created_at": {"$gte": w_start, "$lt": w_end}},
            ]
        })
        weekly_dispatch.append({
            "week": f"W{w+1}",
            "label": f"Week {w+1}",
            "dispatched": w_count
        })

    requisitions = [jsonify_doc(v) for v in pending_vendors]

    # ── 10. Pending Restock Requests for Dashboard Ledger ──────────────────────
    pending_restocks = list(_db.COLS["restock_requests"].find({"status": "pending"}).sort("created_at", -1).limit(25))
    req_vendor_ids = {r.get("vendor_id") for r in pending_restocks if r.get("vendor_id")}
    req_v_names = {v["vendor_id"]: v.get("shop_name", "") for v in vendors_col.find({"vendor_id": {"$in": list(req_vendor_ids)}}, {"vendor_id": 1, "shop_name": 1})} if req_vendor_ids else {}
    restock_requests_list = []
    for r in pending_restocks:
        doc_r = jsonify_doc(r)
        doc_r["vendor_name"] = req_v_names.get(r.get("vendor_id"), r.get("vendor_name", r.get("vendor_id", "")))
        restock_requests_list.append(doc_r)

    # ── 11. Final Structured JSON Response Payload ─────────────────────────────
    return jsonify({
        # Legacy compatibility keys
        "totalVendors": active_vendors,
        "totalBatches": total_batches,
        "assignedBatches": assigned_batches,
        "receivedBatches": received_batches,
        "totalStockQuantity": total_stock,
        "lowStockItems": low_stock,
        # Structured Section 4 keys consumed by React Native Admin Dashboard
        "fleet": {
            "totalActiveVendors": active_vendors,
            "totalBatches": total_batches,
            "deliveredBatches": delivered_batches,
            "batchesInTransit": assigned_batches,
        },
        "inventory": {
            "currentStockKg": total_stock,
            "centralStockKg": central_stock,
            "partnerStockKg": partner_stock,
            "totalNetworkStockKg": total_stock,
            "lowStockShops": low_stock,
        },
        "demandTrends": trend_7day,
        "topSpikeVendors": top_spike_vendors,
        "spoilageDistribution": spoilage_dist,
        "requisitions": requisitions,
        "restockRequests": restock_requests_list,
        "monthlyAnalytics": {
            "dispatchedBatches": dispatched_this_month,
            "totalBatterProducedKg": total_batter_produced_kg,
        },
        "weeklyDispatchTrend": weekly_dispatch,
    })


# ════════════════════════════════════════════════════════════════════
# CENTRALIZED AUDIT LOGGING & SEARCH
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# FUNCTION: ensure_seed_logs()
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Pre-populates demonstration logs if the `_db.COLS["logs"]` collection is empty.
#   Seeds examples of operational approvals, batch dispatches, threshold warnings,
#   and AI inference telemetry.
# ==============================================================================
def ensure_seed_logs():
    if _db.COLS["logs"].count_documents({}) == 0:
        now = datetime.utcnow()
        seeds = [
            {
                "timestamp": now - timedelta(minutes=14),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Admin approved vendor requisition — Lakshmi Idli Shop",
                "related_to": {"type": "vendor", "id": "V100", "name": "Lakshmi Idli Shop"},
                "metadata": {"action": "approve_vendor", "status": "active"},
            },
            {
                "timestamp": now - timedelta(hours=1, minutes=20),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Batch #B20010_FRESH assigned to Lakshmi Idli Shop",
                "related_to": {"type": "batch", "id": "B20010_FRESH", "name": "B20010_FRESH"},
                "metadata": {"batch_id": "B20010_FRESH", "vendor_id": "V100"},
            },
            {
                "timestamp": now - timedelta(hours=2, minutes=5),
                "type": "activity",
                "severity": "info",
                "actor": "Admin",
                "event": "Admin edited inventory for Karthik Dosa Center (+25 kg)",
                "related_to": {"type": "vendor", "id": "V101", "name": "Karthik Dosa Center"},
                "metadata": {"quantity_delta": 25, "reason": "Restock"},
            },
            {
                "timestamp": now - timedelta(hours=3, minutes=45),
                "type": "alert",
                "severity": "warning",
                "actor": "System",
                "event": "Low stock alert — RK Batter House below minimum reserve (12 kg remaining)",
                "related_to": {"type": "vendor", "id": "V104", "name": "RK Batter House"},
                "metadata": {"threshold": 15, "current_stock": 12},
            },
            {
                "timestamp": now - timedelta(hours=5, minutes=10),
                "type": "alert",
                "severity": "critical",
                "actor": "System",
                "event": "Batch #B20000 risk score 99.5% — High Spoilage Risk, flagged for immediate review",
                "related_to": {"type": "batch", "id": "B20000", "name": "B20000"},
                "metadata": {"risk_score": 0.995, "recommendation": "discount_or_retire"},
            },
            {
                "timestamp": now - timedelta(hours=7, minutes=30),
                "type": "system",
                "severity": "info",
                "actor": "System",
                "event": "Demand forecast inference batch completed for 5 active partner shops",
                "related_to": {"type": "system", "id": "XGB_DEMAND", "name": "Demand Forecast Model"},
                "metadata": {"model": "demand_forecast_model.pkl", "features_evaluated": 17},
            },
            {
                "timestamp": now - timedelta(hours=12, minutes=15),
                "type": "system",
                "severity": "warning",
                "actor": "System",
                "event": "Live sensor weather telemetry sync timed out — used fallback atmospheric cache",
                "related_to": {"type": "system", "id": "WEATHER_SYNC", "name": "Weather Telemetry"},
                "metadata": {"retry_scheduled_in_sec": 300},
            },
        ]
        _db.COLS["logs"].insert_many(seeds)

try:
    ensure_seed_logs()
except Exception:
    pass


# ==============================================================================
# ROUTE: GET /api/logs
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Full-featured audit log search & filtering endpoint for Screen 5 (Activity Log).
#   Supports filtering by:
#     - `type`: "activity", "alert", "system", or "all".
#     - `severity`: array of severities ("info", "warning", "critical").
#     - `search`: case-insensitive substring search over event text, actor, and target entity.
#     - `limit`: defaults to 100 entries.
# ==============================================================================
@app.route("/api/logs", methods=["GET"])
def get_logs():
    log_type = request.args.get("type", "all").strip().lower()
    severities = request.args.getlist("severity")
    search = request.args.get("search", "").strip().lower()
    limit = int(request.args.get("limit", 100))

    query = {}
    if log_type and log_type != "all":
        query["type"] = log_type

    if severities:
        query["severity"] = {"$in": severities}

    docs = list(_db.COLS["logs"].find(query).sort("timestamp", DESCENDING).limit(limit))
    results = []
    for d in docs:
        item = jsonify_doc(d)
        if search:
            event_text = item.get("event", "").lower()
            actor_text = item.get("actor", "").lower()
            rel_name = (item.get("related_to") or {}).get("name", "").lower()
            if search not in event_text and search not in actor_text and search not in rel_name:
                continue
        results.append(item)
    return jsonify(results)


# ==============================================================================
# ROUTE: POST /api/logs
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Allows clients or external microservices to inject structured audit events.
# ==============================================================================
@app.route("/api/logs", methods=["POST"])
def create_log():
    try:
        data = request.json or {}
        log_event(
            data.get("type", "activity"),
            data.get("severity", "info"),
            data.get("actor", "Admin"),
            data.get("event", ""),
            data.get("related_to"),
            data.get("metadata"),
        )
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
