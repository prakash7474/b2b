"""
Tests for previously uncovered app.py endpoints:
- Weather forecast (GET/POST)
- Festival calendar (GET)
- ML predictions (POST /api/predict-demand, POST /api/predict-spoilage)
- Audit logs (GET/POST)
- Orders (GET/POST)
- Products catalog (GET)
- Inventory movement audit trail (GET)
- Prediction history & stats (GET)
- Root health check (GET /)
"""

import unittest
import os
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import flask_app
import backend.database as _db
import backend.services.demand as _demand_mod
import backend.services.spoilage as _spoilage_mod

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


def _admin_headers():
    token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
    return {"Authorization": f"Bearer {token}"}


def _vendor_headers():
    token = auth_serializer.dumps(
        {"role": "vendor", "vendor_id": "V100", "shop_name": "Test Shop"}
    )
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════════════════════════════════
# WEATHER FORECAST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
class TestWeatherForecast(unittest.TestCase):
    """Tests for GET/POST /api/weather-forecast."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_get_weather_forecast_no_filter(self):
        """GET /api/weather-forecast returns list of forecasts."""
        mock_docs = [
            {"forecastFor": datetime.utcnow(), "temperatureC": 32.0, "rainProbability": 0.3}
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.limit.return_value = mock_docs
        mock_cols = {"weather_forecast": MagicMock()}
        mock_cols["weather_forecast"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/weather-forecast", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIsInstance(data, list)
            self.assertEqual(len(data), 1)

    def test_get_weather_forecast_with_date_filter(self):
        """GET /api/weather-forecast?date=2026-09-15 filters by date."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.limit.return_value = []
        mock_cols = {"weather_forecast": MagicMock()}
        mock_cols["weather_forecast"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/weather-forecast?date=2026-09-15", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            # Should have called find with a date range query
            mock_cols["weather_forecast"].find.assert_called_once()

    def test_get_weather_forecast_invalid_date_ignored(self):
        """GET /api/weather-forecast?date=not-a-date returns all (invalid date ignored)."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.limit.return_value = []
        mock_cols = {"weather_forecast": MagicMock()}
        mock_cols["weather_forecast"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/weather-forecast?date=invalid", headers=self.headers)
            self.assertEqual(res.status_code, 200)

    def test_post_weather_forecast_success(self):
        """POST /api/weather-forecast creates a manual override forecast."""
        mock_cols = {"weather_forecast": MagicMock(), "logs": MagicMock()}
        mock_cols["weather_forecast"].update_one.return_value = MagicMock(upserted_id="ID_123")

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/weather-forecast",
                json={
                    "date": "2026-09-15",
                    "temperatureC": 35.0,
                    "rainProbability": 0.7,
                    "humidityPct": 80.0,
                },
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            mock_cols["weather_forecast"].update_one.assert_called_once()

    def test_post_weather_forecast_missing_date(self):
        """POST /api/weather-forecast without date returns 400."""
        mock_cols = {"weather_forecast": MagicMock(), "logs": MagicMock()}
        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/weather-forecast",
                json={"temperatureC": 30.0},
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 400)

    def test_post_weather_forecast_invalid_date_format(self):
        """POST /api/weather-forecast with bad date format returns 400."""
        mock_cols = {"weather_forecast": MagicMock(), "logs": MagicMock()}
        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/weather-forecast",
                json={"date": "not-a-date"},
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 400)

    def test_post_weather_forecast_rain_probability_out_of_range(self):
        """POST /api/weather-forecast with rainProbability > 1.0 returns 400."""
        mock_cols = {"weather_forecast": MagicMock(), "logs": MagicMock()}
        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/weather-forecast",
                json={"date": "2026-09-15", "rainProbability": 1.5},
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 400)

    def test_post_weather_forecast_temperature_out_of_range(self):
        """POST /api/weather-forecast with temperatureC > 55 returns 400."""
        mock_cols = {"weather_forecast": MagicMock(), "logs": MagicMock()}
        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/weather-forecast",
                json={"date": "2026-09-15", "temperatureC": 60.0},
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 400)


# ══════════════════════════════════════════════════════════════════════
# FESTIVAL CALENDAR ENDPOINT
# ══════════════════════════════════════════════════════════════════════
class TestFestivalCalendar(unittest.TestCase):
    """Tests for GET /api/festival-calendar."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_get_festival_calendar_no_filter(self):
        """GET /api/festival-calendar returns all festivals."""
        mock_docs = [
            {"name": "Diwali", "date": datetime(2026, 10, 20), "region": "National"},
            {"name": "Pongal", "date": datetime(2027, 1, 14), "region": "Tamil Nadu"},
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_docs
        mock_cols = {"festival_calendar": MagicMock()}
        mock_cols["festival_calendar"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/festival-calendar", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 2)

    def test_get_festival_calendar_with_region_filter(self):
        """GET /api/festival-calendar?region=Tamil Nadu filters by region."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = []
        mock_cols = {"festival_calendar": MagicMock()}
        mock_cols["festival_calendar"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get(
                "/api/festival-calendar?region=Tamil+Nadu", headers=self.headers
            )
            self.assertEqual(res.status_code, 200)
            # Verify the query included the region filter
            call_args = mock_cols["festival_calendar"].find.call_args[0][0]
            self.assertEqual(call_args.get("region"), "Tamil Nadu")

    def test_get_festival_calendar_empty_result(self):
        """GET /api/festival-calendar returns empty list when no festivals match."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = []
        mock_cols = {"festival_calendar": MagicMock()}
        mock_cols["festival_calendar"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get(
                "/api/festival-calendar?region=NonExistent", headers=self.headers
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json(), [])


# ══════════════════════════════════════════════════════════════════════
# ML PREDICTION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
class TestMLPredictions(unittest.TestCase):
    """Tests for POST /api/predict-demand and POST /api/predict-spoilage."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_predict_demand_returns_prediction(self):
        """POST /api/predict-demand returns predicted demand and dispatch."""
        mock_prediction = MagicMock()
        mock_prediction.__float__ = lambda self: 42.5
        mock_prediction.tolist = lambda self: [42.5]

        mock_proba = MagicMock()
        mock_proba.tolist = lambda self: [0.85, 0.15]

        mock_cols = {
            "predictions": MagicMock(),
            "feature_snapshots": MagicMock(),
            "orders": MagicMock(),
            "order_items": MagicMock(),
            "weather_forecast": MagicMock(),
            "festival_calendar": MagicMock(),
            "batches": MagicMock(),
            "inventory": MagicMock(),
        }
        mock_cols["predictions"].insert_one.return_value = MagicMock(inserted_id="PRED_123")
        mock_cols["feature_snapshots"].insert_one.return_value = MagicMock()

        with patch.dict(_db.COLS, mock_cols):
            with patch.object(_demand_mod, "demand_model") as mock_model:
                mock_model.predict.return_value = mock_prediction
                res = self.client.post(
                    "/api/predict-demand",
                    json={
                        "vendor_id": "V100",
                        "product_name": "Idli Batter",
                        "date": "2026-09-15",
                        "window": "morning",
                        "temperatureC": 30.0,
                        "rainProbability": 0.2,
                        "localityTier": "residential_budget",
                        "availableStock": 20.0,
                        "safetyStock": 5.0,
                    },
                    headers=self.headers,
                )
                self.assertEqual(res.status_code, 200)
                data = res.get_json()
                self.assertIn("predictedDemand", data)
                self.assertIn("recommendedDispatch", data)
                self.assertIn("vendorId", data)

    def test_predict_demand_missing_body(self):
        """POST /api/predict-demand with empty body still works (uses defaults)."""
        mock_prediction = MagicMock()
        mock_prediction.__float__ = lambda self: 35.0
        mock_prediction.tolist = lambda self: [35.0]

        mock_cols = {
            "predictions": MagicMock(),
            "feature_snapshots": MagicMock(),
            "orders": MagicMock(),
            "order_items": MagicMock(),
            "weather_forecast": MagicMock(),
            "festival_calendar": MagicMock(),
            "batches": MagicMock(),
            "inventory": MagicMock(),
        }
        mock_cols["predictions"].insert_one.return_value = MagicMock(inserted_id="PRED_456")
        mock_cols["feature_snapshots"].insert_one.return_value = MagicMock()

        with patch.dict(_db.COLS, mock_cols):
            with patch.object(_demand_mod, "demand_model") as mock_model:
                mock_model.predict.return_value = mock_prediction
                res = self.client.post(
                    "/api/predict-demand",
                    json={},
                    headers=self.headers,
                )
                self.assertEqual(res.status_code, 200)
                data = res.get_json()
                self.assertIn("predictedDemand", data)

    def test_predict_demand_model_error_returns_400(self):
        """POST /api/predict-demand returns 400 when model throws."""
        with patch.object(_demand_mod, "demand_model") as mock_model:
            mock_model.predict.side_effect = RuntimeError("Model not loaded")
            mock_cols = {
                "predictions": MagicMock(),
                "feature_snapshots": MagicMock(),
                "orders": MagicMock(),
                "order_items": MagicMock(),
                "weather_forecast": MagicMock(),
                "festival_calendar": MagicMock(),
                "batches": MagicMock(),
                "inventory": MagicMock(),
            }
            with patch.dict(_db.COLS, mock_cols):
                res = self.client.post(
                    "/api/predict-demand",
                    json={"vendor_id": "V100"},
                    headers=self.headers,
                )
                self.assertEqual(res.status_code, 400)
                data = res.get_json()
                self.assertIn("error", data)

    def test_predict_spoilage_returns_risk_label(self):
        """POST /api/predict-spoilage returns risk label and probabilities."""
        import numpy as np

        mock_prediction = np.array([0])
        mock_proba = np.array([[0.8, 0.15, 0.05]])

        mock_label_encoder = MagicMock()
        mock_label_encoder.inverse_transform.return_value = ["Low"]
        mock_label_encoder.classes_ = np.array(["High", "Low", "Medium"])

        mock_cols = {
            "predictions": MagicMock(),
            "feature_snapshots": MagicMock(),
        }
        mock_cols["predictions"].insert_one.return_value = MagicMock(inserted_id="PRED_789")
        mock_cols["feature_snapshots"].insert_one.return_value = MagicMock()

        with patch.dict(_db.COLS, mock_cols):
            with patch.object(_spoilage_mod, "spoilage_model") as mock_model:
                mock_model.predict.return_value = mock_prediction
                mock_model.predict_proba.return_value = mock_proba
                with patch.object(_spoilage_mod, "label_encoder", mock_label_encoder):
                    res = self.client.post(
                        "/api/predict-spoilage",
                        json={
                            "vendor_id": "V100",
                            "batch_id": "B001",
                            "product_name": "Idli Batter",
                            "initialPH": 4.4,
                            "hoursSinceManufacture": 24,
                            "hasRefrigerator": True,
                            "storageType": "fridge",
                            "ambientTemperatureC": 30.0,
                            "humidityPct": 65.0,
                        },
                        headers=self.headers,
                    )
                    self.assertEqual(res.status_code, 200)
                    data = res.get_json()
                    self.assertIn("riskLabel", data)
                    self.assertIn("confidence", data)
                    self.assertIn("probabilities", data)

    def test_predict_spoilage_model_error_returns_400(self):
        """POST /api/predict-spoilage returns 400 when model throws."""
        with patch.object(_spoilage_mod, "spoilage_model") as mock_model:
            mock_model.predict.side_effect = RuntimeError("Spoilage model unavailable")
            mock_cols = {
                "predictions": MagicMock(),
                "feature_snapshots": MagicMock(),
            }
            with patch.dict(_db.COLS, mock_cols):
                res = self.client.post(
                    "/api/predict-spoilage",
                    json={"vendor_id": "V100"},
                    headers=self.headers,
                )
                self.assertEqual(res.status_code, 400)
                data = res.get_json()
                self.assertIn("error", data)


# ══════════════════════════════════════════════════════════════════════
# AUDIT LOGS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
class TestAuditLogs(unittest.TestCase):
    """Tests for GET/POST /api/logs."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def _mock_logs_cursor(self, docs):
        """Helper: create a chained mock cursor for logs find().sort().limit()."""
        mock_limit = MagicMock()
        mock_limit.return_value = docs
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        return mock_find, mock_limit

    def test_get_logs_returns_list(self):
        """GET /api/logs returns list of audit log entries."""
        mock_docs = [
            {
                "type": "activity",
                "severity": "info",
                "event": "Admin approved restock",
                "actor": "Admin",
                "timestamp": datetime.utcnow(),
                "related_to": {"name": "RSR_123"},
            }
        ]
        mock_find, _ = self._mock_logs_cursor(mock_docs)
        mock_cols = {"logs": MagicMock()}
        mock_cols["logs"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/logs", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIsInstance(data, list)

    def test_get_logs_with_type_filter(self):
        """GET /api/logs?type=alert filters by log type."""
        mock_find, _ = self._mock_logs_cursor([])
        mock_cols = {"logs": MagicMock()}
        mock_cols["logs"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/logs?type=alert", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            call_args = mock_cols["logs"].find.call_args[0][0]
            self.assertEqual(call_args.get("type"), "alert")

    def test_get_logs_with_severity_filter(self):
        """GET /api/logs?severity=warning&severity=critical filters by severity."""
        mock_find, _ = self._mock_logs_cursor([])
        mock_cols = {"logs": MagicMock()}
        mock_cols["logs"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get(
                "/api/logs?severity=warning&severity=critical", headers=self.headers
            )
            self.assertEqual(res.status_code, 200)
            call_args = mock_cols["logs"].find.call_args[0][0]
            self.assertIn("severity", call_args)

    def test_get_logs_with_search_filter(self):
        """GET /api/logs?search=restock filters by text search."""
        mock_docs = [
            {
                "type": "activity",
                "severity": "info",
                "event": "Admin approved restock request",
                "actor": "Admin",
                "timestamp": datetime.utcnow(),
                "related_to": {"name": "RSR_123"},
            },
            {
                "type": "activity",
                "severity": "info",
                "event": "Batch created",
                "actor": "Kitchen",
                "timestamp": datetime.utcnow(),
                "related_to": {"name": "B001"},
            },
        ]
        mock_find, _ = self._mock_logs_cursor(mock_docs)
        mock_cols = {"logs": MagicMock()}
        mock_cols["logs"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/logs?search=restock", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            # Only the first log matches "restock"
            self.assertEqual(len(data), 1)
            self.assertIn("restock", data[0]["event"].lower())

    def test_get_logs_type_all_returns_unfiltered(self):
        """GET /api/logs?type=all does not add type filter."""
        mock_find, _ = self._mock_logs_cursor([])
        mock_cols = {"logs": MagicMock()}
        mock_cols["logs"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/logs?type=all", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            call_args = mock_cols["logs"].find.call_args[0][0]
            self.assertNotIn("type", call_args)

    def test_post_log_creates_entry(self):
        """POST /api/logs creates a new audit log entry."""
        mock_cols = {"logs": MagicMock()}

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/logs",
                json={
                    "type": "activity",
                    "severity": "info",
                    "actor": "System",
                    "event": "Test log entry",
                },
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))


# ══════════════════════════════════════════════════════════════════════
# ORDERS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
class TestOrders(unittest.TestCase):
    """Tests for GET/POST /api/orders."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()
        self.vendor_headers = _vendor_headers()

    def test_get_orders_no_filter(self):
        """GET /api/orders returns all orders."""
        mock_docs = [
            {"order_id": "ORD_001", "vendor_id": "V100", "quantity_kg": 25.0},
            {"order_id": "ORD_002", "vendor_id": "V200", "quantity_kg": 15.0},
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_docs
        mock_cols = {"orders": MagicMock()}
        mock_cols["orders"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/orders", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 2)

    def test_get_orders_with_vendor_filter(self):
        """GET /api/orders?vendor_id=V100 filters by vendor."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = []
        mock_cols = {"orders": MagicMock()}
        mock_cols["orders"].find.return_value = mock_cursor

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/orders?vendor_id=V100", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            call_args = mock_cols["orders"].find.call_args[0][0]
            self.assertEqual(call_args.get("vendor_id"), "V100")

    def test_create_order_success(self):
        """POST /api/orders creates order and restock request."""
        mock_cols = {
            "orders": MagicMock(),
            "restock_requests": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = {"vendor_id": "V100", "shop_name": "Test"}
        mock_cols["inventory"].find_one.return_value = {"vendor_id": "V100", "quantity": 5.0}

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/orders",
                json={
                    "vendor_id": "V100",
                    "product_name": "Idli Batter",
                    "requested_quantity_kg": 20.0,
                    "notes": "Need restock",
                },
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertIn("order_id", data)
            self.assertIn("request_id", data)
            mock_cols["orders"].insert_one.assert_called_once()
            mock_cols["restock_requests"].insert_one.assert_called_once()

    def test_create_order_missing_vendor_id(self):
        """POST /api/orders without vendor_id returns 400."""
        mock_cols = {
            "orders": MagicMock(),
            "restock_requests": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "logs": MagicMock(),
        }
        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/orders",
                json={"product_name": "Idli Batter", "requested_quantity_kg": 10.0},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 400)

    def test_create_order_default_quantity(self):
        """POST /api/orders uses default 10.0 kg when quantity not specified."""
        mock_cols = {
            "orders": MagicMock(),
            "restock_requests": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = None
        mock_cols["inventory"].find_one.return_value = None

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.post(
                "/api/orders",
                json={"vendor_id": "V100"},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            # Verify default quantity was used in the inserted doc
            insert_call = mock_cols["orders"].insert_one.call_args[0][0]
            self.assertEqual(insert_call["quantity_kg"], 10.0)


# ══════════════════════════════════════════════════════════════════════
# PRODUCTS CATALOG ENDPOINT
# ══════════════════════════════════════════════════════════════════════
class TestProducts(unittest.TestCase):
    """Tests for GET /api/products."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_get_products_returns_catalog(self):
        """GET /api/products returns product catalog."""
        mock_docs = [
            {"product_id": "P1", "name": "Idli Batter", "shelf_life_hrs": 72},
            {"product_id": "P2", "name": "Dosa Batter", "shelf_life_hrs": 48},
        ]
        mock_cols = {"products": MagicMock()}
        mock_cols["products"].find.return_value = mock_docs

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/products", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 2)
            self.assertEqual(data[0]["name"], "Idli Batter")

    def test_get_products_empty_catalog(self):
        """GET /api/products returns empty list when no products."""
        mock_cols = {"products": MagicMock()}
        mock_cols["products"].find.return_value = []

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/products", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json(), [])


# ══════════════════════════════════════════════════════════════════════
# INVENTORY MOVEMENT AUDIT TRAIL
# ══════════════════════════════════════════════════════════════════════
class TestInventoryMovement(unittest.TestCase):
    """Tests for GET /api/inventory-movement."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_get_inventory_movement_no_filter(self):
        """GET /api/inventory-movement returns movement history."""
        mock_docs = [
            {"vendorId": "V100", "movement_type": "vendor_update", "quantity": -5.0}
        ]
        # Chain: find().sort().limit()
        mock_limit = MagicMock()
        mock_limit.return_value = mock_docs
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"inventory_movement": MagicMock()}
        mock_cols["inventory_movement"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/inventory-movement", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 1)

    def test_get_inventory_movement_with_vendor_filter(self):
        """GET /api/inventory-movement?vendorId=V100 filters by vendor."""
        mock_limit = MagicMock()
        mock_limit.return_value = []
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"inventory_movement": MagicMock()}
        mock_cols["inventory_movement"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get(
                "/api/inventory-movement?vendorId=V100", headers=self.headers
            )
            self.assertEqual(res.status_code, 200)
            call_args = mock_cols["inventory_movement"].find.call_args[0][0]
            self.assertEqual(call_args.get("vendorId"), "V100")

    def test_get_inventory_movement_with_limit(self):
        """GET /api/inventory-movement?limit=10 respects limit parameter."""
        mock_limit = MagicMock()
        mock_limit.return_value = []
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"inventory_movement": MagicMock()}
        mock_cols["inventory_movement"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get(
                "/api/inventory-movement?limit=10", headers=self.headers
            )
            self.assertEqual(res.status_code, 200)
            mock_limit.assert_called_with(10)


# ══════════════════════════════════════════════════════════════════════
# PREDICTION HISTORY & STATS
# ══════════════════════════════════════════════════════════════════════
class TestPredictionHistoryAndStats(unittest.TestCase):
    """Tests for GET /api/history and GET /api/stats."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.headers = _admin_headers()

    def test_get_history_returns_predictions(self):
        """GET /api/history returns prediction history."""
        mock_docs = [
            {
                "_id": "obj_id_1",
                "predictionType": "DEMAND",
                "vendorId": "V100",
                "predictedValue": 42.5,
                "generatedAt": datetime.utcnow(),
            }
        ]
        # Chain: find().sort().limit()
        mock_limit = MagicMock()
        mock_limit.return_value = mock_docs
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"predictions": MagicMock()}
        mock_cols["predictions"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/history", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 1)
            # _id should be converted to string
            self.assertIsInstance(data[0]["_id"], str)

    def test_get_history_with_limit(self):
        """GET /api/history?limit=5 respects limit parameter."""
        mock_limit = MagicMock()
        mock_limit.return_value = []
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"predictions": MagicMock()}
        mock_cols["predictions"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/history?limit=5", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            mock_limit.assert_called_with(5)

    def test_get_history_serializes_datetime(self):
        """GET /api/history converts datetime objects to ISO strings."""
        now = datetime.utcnow()
        mock_docs = [
            {
                "_id": "obj_1",
                "predictionType": "SPOILAGE_RISK",
                "generatedAt": now,
                "date": now,
            }
        ]
        # Chain: find().sort().limit()
        mock_limit = MagicMock()
        mock_limit.return_value = mock_docs
        mock_sort = MagicMock()
        mock_sort.limit = mock_limit
        mock_find = MagicMock()
        mock_find.sort.return_value = mock_sort
        mock_cols = {"predictions": MagicMock()}
        mock_cols["predictions"].find.return_value = mock_find

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/history", headers=self.headers)
            data = res.get_json()
            self.assertIsInstance(data[0]["generatedAt"], str)

    def test_get_stats_returns_counts(self):
        """GET /api/stats returns prediction counts by type."""
        mock_cols = {"predictions": MagicMock()}
        mock_cols["predictions"].count_documents.side_effect = [100, 60, 40]

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/stats", headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn("totalPredictions", data)
            self.assertIn("demandPredictions", data)
            self.assertIn("spoilagePredictions", data)

    def test_get_stats_empty_database(self):
        """GET /api/stats returns zeros when no predictions exist."""
        mock_cols = {"predictions": MagicMock()}
        mock_cols["predictions"].count_documents.return_value = 0

        with patch.dict(_db.COLS, mock_cols):
            res = self.client.get("/api/stats", headers=self.headers)
            data = res.get_json()
            self.assertEqual(data["totalPredictions"], 0)
            self.assertEqual(data["demandPredictions"], 0)
            self.assertEqual(data["spoilagePredictions"], 0)


# ══════════════════════════════════════════════════════════════════════
# ROOT HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════
class TestRootHealthCheck(unittest.TestCase):
    """Tests for GET / (root health check)."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True

    def test_root_returns_health_status(self):
        """GET / returns plain text health status."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.decode(), "B2P Backend is running. API docs at /api/vendors, /api/batches, etc.")


if __name__ == "__main__":
    unittest.main()
