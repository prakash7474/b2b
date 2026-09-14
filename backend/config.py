"""
══════════════════════════════════════════════════════════════════════════════
📌 B2P (Batter-to-Plate) — UNIFIED BACKEND SERVER (app.py)
══════════════════════════════════════════════════════════════════════════════
WHAT THIS BACKEND DOES:
  1. REST API: Serves all data to the React Native web and mobile frontend.
  2. Database Layer: Connects to MongoDB Atlas (or local MongoDB) storing:
     - Vendors (partner shops), Batches (batter containers), Inventory (stock levels),
     - Restock Requests, Orders, Inventory Movements, and Activity Logs.
  3. AI / ML Integration:
     - Loads demand_forecast_model.pkl (XGBoost) for predictive stock replenishment.
     - Loads spoilage_risk_model.pkl (Random Forest) to prevent sour/spoiled batter.
  4. Workflows:
     - Batch Lifecycle: Manufacture -> Assign to Shop -> Receive -> Stockout/Archive.
     - Inventory Sync: Ensures shop inventory strictly equals active batches.

💡 INSTRUCTOR DEMO QUICK-REFERENCE:
  - Change default Admin Login: lines 70-71 (ADMIN_USER, ADMIN_PASS)
  - Change MongoDB URI: line 74 (MONGODB_URI)
  - Change Port / Host: bottom of this file (port=5000)
══════════════════════════════════════════════════════════════════════════════
"""

import os

from flask import Flask
from flask_cors import CORS
from itsdangerous import URLSafeTimedSerializer

# ── Secret loading (from env files) ──────────────────────────────────
def _load_env_file(path=".env"):
    """Load a simple KEY=VALUE file into the environment without extra deps."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), val)


_load_env_file()

# ── Flask Server & CORS Setup ────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "b2p-secret-key-rotate-in-production")

# Allow cross-origin requests from React Native Web (localhost:8081 / Expo)
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
)

# Token serializer for mobile React Native clients (Option B auth)
auth_serializer = URLSafeTimedSerializer(app.secret_key, salt="b2p-auth")

# ════════════════════════════════════════════════════════════════════
# 🏷️ ADMIN CREDENTIALS
# 👉 CHANGE HERE IF ASKED TO CHANGE DEFAULT LOGIN CREDENTIALS:
# ════════════════════════════════════════════════════════════════════
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")
