"""
B2P (Batter-to-Plate) — Thin Entry Point
=========================================
This file wires together all backend modules and starts the server.
All business logic lives in:
  - backend/config.py       — Flask app, CORS, secrets
  - backend/database.py     — MongoDB, COLS, shared DB utilities
  - backend/auth.py         — Token auth, middleware, login/logout
  - backend/services/       — ML models, weather, festivals
  - backend/routes/         — All REST API route handlers
"""

import sys
import os

# Ensure project root is on the path so `backend.*` imports resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Core infrastructure (order matters: config → database → auth) ──────
from backend.config import app, ADMIN_USER, ADMIN_PASS          # noqa: F401
from backend.database import COLS, client, db                    # noqa: F401
from backend.auth import auth_serializer                         # noqa: F401

# ── Services (triggers ML model loading + seeds) ─────────────────────
import backend.services.weather                                  # noqa: F401
import backend.services.festivals                               # noqa: F401
import backend.services.demand                                  # noqa: F401
import backend.services.spoilage                                # noqa: F401

# ── Routes (registers all @app.route handlers) ──────────────────────
import backend.routes.dashboard                                 # noqa: F401
import backend.routes.vendors                                   # noqa: F401
import backend.routes.batches                                   # noqa: F401
import backend.routes.inventory                                 # noqa: F401
import backend.routes.orders                                    # noqa: F401
import backend.routes.predictions                               # noqa: F401


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
