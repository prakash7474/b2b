"""
Unit tests for token-based authentication (Option B) in app.py.
"""

import unittest
import os
import importlib.util
from unittest.mock import patch

# Load root app.py explicitly to avoid collision with app/ package
app_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))
spec = importlib.util.spec_from_file_location("flask_app", app_path)
flask_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flask_app)

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


class TestTokenAuth(unittest.TestCase):
    """Test suite verifying Bearer token authentication in Flask app."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True

    def test_admin_login_returns_token(self):
        """Admin login must return a signed token and role admin."""
        res = self.client.post("/api/login", json={
            "role": "admin",
            "username": ADMIN_USER,
            "password": ADMIN_PASS,
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("role"), "admin")
        self.assertIn("token", data)
        self.assertTrue(len(data["token"]) > 10)

        # Verify token contents
        user_info = auth_serializer.loads(data["token"])
        self.assertEqual(user_info.get("role"), "admin")
        self.assertEqual(user_info.get("username"), ADMIN_USER)

    def test_vendor_login_returns_token(self):
        """Vendor login with valid vendor_id returns signed token and role vendor."""
        mock_vendor = {"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"}
        with patch.object(flask_app, "COLS") as mock_cols:
            mock_cols.__getitem__.return_value.find_one.return_value = mock_vendor
            res = self.client.post("/api/login", json={
                "role": "vendor",
                "vendor_id": "V100",
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("role"), "vendor")
            self.assertIn("token", data)
            self.assertEqual(data.get("vendor_id"), "V100")

    def test_api_me_with_bearer_token(self):
        """GET /api/me must authenticate and identify user via Bearer token."""
        token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        res = self.client.get("/api/me", headers={
            "Authorization": f"Bearer {token}",
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("loggedIn"))
        self.assertEqual(data.get("role"), "admin")
        self.assertEqual(data.get("username"), ADMIN_USER)

    def test_api_me_unauthenticated(self):
        """GET /api/me without token or cookie returns loggedIn: False."""
        res = self.client.get("/api/me")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data.get("loggedIn"))

    def test_protected_endpoint_rejects_invalid_token(self):
        """Protected endpoint returns 401 on bad token."""
        res = self.client.get("/api/dashboard", headers={
            "Authorization": "Bearer invalid.fake.token",
        })
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertEqual(data.get("error"), "Authentication required")

    def test_protected_endpoint_accepts_valid_token(self):
        """Protected endpoint grants access with valid Bearer token."""
        token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        with patch.object(flask_app, "COLS") as mock_cols:
            mock_cols.__getitem__.return_value.count_documents.return_value = 5
            mock_cols.__getitem__.return_value.aggregate.return_value = []
            res = self.client.get("/api/dashboard", headers={
                "Authorization": f"Bearer {token}",
            })
            self.assertEqual(res.status_code, 200)


if __name__ == "__main__":
    unittest.main()
