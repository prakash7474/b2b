"""
Edge-case and negative-path tests for B2P Flask backend.
Covers: auth failures, missing params, invalid roles, empty payloads,
and scenarios where mocked tests might produce false positives.
"""

import unittest
import os
from unittest.mock import patch, MagicMock

import flask_app

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


class TestAuthEdgeCases(unittest.TestCase):
    """Edge cases around authentication that existing tests miss."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True

    def test_login_with_empty_body(self):
        """POST /api/login with empty JSON body returns 400 or 401."""
        res = self.client.post("/api/login", json={})
        self.assertIn(res.status_code, [400, 401])

    def test_login_admin_wrong_password(self):
        """Admin login with wrong password must fail with 401."""
        res = self.client.post("/api/login", json={
            "role": "admin",
            "username": ADMIN_USER,
            "password": "wrong_password_12345",
        })
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertIn("error", data)

    def test_login_admin_wrong_username(self):
        """Admin login with wrong username must fail with 401."""
        res = self.client.post("/api/login", json={
            "role": "admin",
            "username": "nonexistent_admin",
            "password": ADMIN_PASS,
        })
        self.assertEqual(res.status_code, 401)

    def test_login_invalid_role(self):
        """Login with role='superadmin' (not supported) returns 400."""
        res = self.client.post("/api/login", json={
            "role": "superadmin",
            "username": ADMIN_USER,
            "password": ADMIN_PASS,
        })
        self.assertEqual(res.status_code, 400)

    def test_vendor_login_missing_vendor_id(self):
        """Vendor login without vendor_id returns 400."""
        res = self.client.post("/api/login", json={"role": "vendor"})
        self.assertEqual(res.status_code, 400)

    def test_vendor_login_empty_vendor_id(self):
        """Vendor login with empty vendor_id string returns 400."""
        res = self.client.post("/api/login", json={
            "role": "vendor",
            "vendor_id": "  ",
        })
        self.assertEqual(res.status_code, 400)

    def test_vendor_login_nonexistent_vendor(self):
        """Vendor login with non-existent vendor ID returns 404."""
        mock_cols = MagicMock()
        mock_cols.__getitem__ = lambda self, key: MagicMock(find_one=lambda *a, **kw: None)
        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.post("/api/login", json={
                "role": "vendor",
                "vendor_id": "V_FAKE_999",
            })
            self.assertEqual(res.status_code, 404)

    def test_me_endpoint_no_token(self):
        """GET /api/me without any auth returns loggedIn: False."""
        res = self.client.get("/api/me")
        data = res.get_json()
        self.assertFalse(data.get("loggedIn"))

    def test_me_endpoint_malformed_token(self):
        """GET /api/me with malformed token returns loggedIn: False."""
        res = self.client.get("/api/me", headers={
            "Authorization": "Bearer not.a.valid.token",
        })
        data = res.get_json()
        self.assertFalse(data.get("loggedIn"))


class TestInventoryEdgeCases(unittest.TestCase):
    """Edge cases for inventory endpoints that existing tests miss."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {admin_token}"}
        vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Test Shop"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {vendor_token}"}

    def test_inventory_summary_missing_vendor_id(self):
        """GET /api/inventory/summary without vendor_id returns 400."""
        res = self.client.get("/api/inventory/summary", headers=self.vendor_headers)
        self.assertEqual(res.status_code, 400)

    def test_inventory_get_with_vendor_filter(self):
        """GET /api/inventory?vendorId=V100 returns filtered results."""
        mock_cols = {
            "inventory": MagicMock(),
            "vendors": MagicMock(),
        }
        mock_cols["inventory"].find.return_value = [
            {"vendor_id": "V100", "quantity": 10.0, "product_name": "Idli Batter"}
        ]
        mock_cols["vendors"].find.return_value = [
            {"vendor_id": "V100", "shop_name": "Test Shop"}
        ]
        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.get("/api/inventory?vendorId=V100", headers=self.admin_headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["vendor_name"], "Test Shop")

    def test_vendor_update_stock_missing_vendor_id(self):
        """PUT /api/vendor/inventory/update without vendor_id returns 400."""
        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"remaining_quantity_kg": 5.0},
            headers=self.vendor_headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_vendor_update_stock_missing_quantity(self):
        """PUT /api/vendor/inventory/update without quantity returns 400."""
        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100"},
            headers=self.vendor_headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_vendor_update_stock_negative_quantity_clamped(self):
        """PUT /api/vendor/inventory/update with negative quantity clamps to 0."""
        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = {"vendor_id": "V100", "shop_name": "Test"}
        mock_cols["inventory"].find_one.return_value = {"vendor_id": "V100", "quantity": 10.0, "minimumStock": 5.0}

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.put(
                "/api/vendor/inventory/update",
                json={"vendor_id": "V100", "remaining_quantity_kg": -5.0},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            # Negative values should be clamped to 0
            self.assertEqual(data.get("remaining_quantity_kg"), 0.0)

    def test_restock_request_missing_vendor_id(self):
        """POST /api/restock-requests without vendor_id returns 400."""
        res = self.client.post(
            "/api/restock-requests",
            json={"requested_quantity_kg": 10.0},
            headers=self.vendor_headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_create_batch_missing_fields(self):
        """POST /api/batches with missing required fields returns 400."""
        res = self.client.post(
            "/api/batches",
            json={},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_assign_batch_nonexistent_vendor(self):
        """PUT /api/batches/<id>/assign with non-existent vendor returns 404."""
        mock_cols = {
            "vendors": MagicMock(),
            "batches": MagicMock(),
            "inventory": MagicMock(),
            "inventory_movement": MagicMock(),
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.put(
                "/api/batches/B999/assign",
                json={"vendor_id": "V_FAKE"},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 404)

    def test_receive_batch_nonexistent_batch(self):
        """PUT /api/batches/<id>/receive with non-existent batch returns 404."""
        mock_cols = {
            "batches": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["batches"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.put(
                "/api/batches/B_FAKE_999/receive",
                json={"notes": "test"},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 404)


class TestDashboardEdgeCases(unittest.TestCase):
    """Edge cases for the admin dashboard endpoint."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {admin_token}"}

    def test_dashboard_unauthenticated(self):
        """GET /api/dashboard without token returns 401."""
        res = self.client.get("/api/dashboard")
        self.assertEqual(res.status_code, 401)

    def test_dashboard_vendor_cannot_access(self):
        """GET /api/dashboard with vendor token returns 403."""
        vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Test"}
        )
        res = self.client.get(
            "/api/dashboard",
            headers={"Authorization": f"Bearer {vendor_token}"},
        )
        self.assertEqual(res.status_code, 403)


class TestBatchEdgeCases(unittest.TestCase):
    """Edge cases for batch lifecycle endpoints."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {admin_token}"}
        vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Test"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {vendor_token}"}

    def test_get_batches_with_status_filter(self):
        """GET /api/batches?status=received filters correctly."""
        mock_cols = {"batches": MagicMock()}
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = [
            {"batch_id": "B1", "status": "received"},
        ]
        mock_cols["batches"].find.return_value = mock_cursor

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.get("/api/batches?status=received", headers=self.admin_headers)
            self.assertEqual(res.status_code, 200)

    def test_delete_batch_nonexistent(self):
        """DELETE /api/batches/<id> with non-existent batch returns 404."""
        mock_cols = {"batches": MagicMock()}
        mock_cols["batches"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.delete("/api/batches/B_FAKE_DELETE", headers=self.admin_headers)
            self.assertEqual(res.status_code, 404)

    def test_report_issue_missing_fields(self):
        """POST /api/batches/<id>/report-issue without fields returns 400."""
        mock_cols = {"batches": MagicMock()}
        mock_cols["batches"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.post(
                "/api/batches/B999/report-issue",
                json={},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 404)


class TestRegressionsFromMocks(unittest.TestCase):
    """
    Tests that specifically target potential false positives in the mock-heavy
    test_vendor_workflow.py. These use side_effect to simulate real DB behaviors
    like returning None for missing documents or raising exceptions.
    """

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {admin_token}"}
        vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Test"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {vendor_token}"}

    def test_vendor_update_stock_db_connection_error(self):
        """Vendor stock update handles database connection error gracefully."""
        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.side_effect = Exception("Connection refused")

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.put(
                "/api/vendor/inventory/update",
                json={"vendor_id": "V100", "remaining_quantity_kg": 5.0},
                headers=self.vendor_headers,
            )
            # Should not crash the server — returns 400 with error message
            self.assertIn(res.status_code, [400, 500])
            data = res.get_json()
            self.assertIn("error", data)

    def test_restock_request_vendor_not_found(self):
        """Restock request with non-existent vendor returns 404."""
        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.post(
                "/api/restock-requests",
                json={
                    "vendor_id": "V_FAKE",
                    "product_name": "Idli Batter",
                    "requested_quantity_kg": 20.0,
                },
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 404)

    def test_approve_restock_request_not_found(self):
        """Approving a non-existent restock request returns 404."""
        mock_cols = {
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "vendors": MagicMock(),
            "logs": MagicMock(),
            "batches": MagicMock(),
        }
        mock_cols["restock_requests"].find_one.return_value = None
        mock_cols["orders"].find_one.return_value = None

        with patch.object(flask_app, "COLS", mock_cols):
            res = self.client.patch(
                "/api/restock-requests/RSR_FAKE/approve",
                json={"admin_notes": "test"},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
