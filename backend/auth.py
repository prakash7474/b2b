"""
Authentication & Session Management for B2P Backend.
Extracted from app.py — handles dual-mode auth (Bearer tokens + session cookies).
"""

from functools import wraps
from flask import request, jsonify, session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from backend.config import app, ADMIN_USER, ADMIN_PASS
from backend.database import COLS

auth_serializer = URLSafeTimedSerializer(app.secret_key, salt="b2p-auth")


# ==============================================================================
# DECORATOR: login_required(f)
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Decorator for Flask routes requiring an active user session.
#   Returns HTTP 401 Unauthorized if "user" key is missing from Flask `session`.
# ==============================================================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


# Whitelist of public API routes that bypass mandatory authentication checks.
# /api/login (authenticates users), /api/me (auth-state probe), /api/logout (destroys session).
PUBLIC_API_ENDPOINTS = {"/api/login", "/api/me", "/api/logout"}


# ==============================================================================
# FUNCTION: _get_authenticated_user()
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Extracts and validates identity from either:
#   1. React Native Mobile App: `Authorization: Bearer <signed_token>` header.
#      Decodes and cryptographically verifies token via `itsdangerous.URLSafeTimedSerializer`.
#      Tokens expire after 7 days (604,800 seconds).
#   2. Web Browser Dashboard: Flask server-side encrypted session cookie (`session.get("user")`).
#
# INSTRUCTOR VIVA POINT:
#   Q: "Why support both Bearer tokens and Session cookies?"
#   A: "React Native mobile apps do not handle browser cookie jars reliably across
#      network boundaries, so they pass cryptographically signed Bearer JWT/timed
#      tokens in HTTP headers. Web browsers natively manage HTTP-only session cookies."
# ==============================================================================
def _get_authenticated_user():
    """Extract authenticated user from Authorization Bearer token or session cookie."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            return auth_serializer.loads(token, max_age=604800)  # 7-day token validity
        except (BadSignature, SignatureExpired):
            return None
    return session.get("user")


# ==============================================================================
# MIDDLEWARE HOOK: @app.before_request -> _require_api_auth()
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Global security guard running before every HTTP request:
#   1. Ignores static web assets and templates (only filters `/api/*`).
#   2. Allows HTTP OPTIONS requests (critical for CORS preflight handshakes from React Native).
#   3. Allows unauthenticated access to PUBLIC_API_ENDPOINTS.
#   4. For all other API requests: checks `_get_authenticated_user()`.
#      - If invalid/expired: returns HTTP 401 Unauthorized immediately.
#      - If valid: injects user into `session["user"]` so downstream route handlers
#        can access caller identity seamlessly.
# ==============================================================================
@app.before_request
def _require_api_auth():
    """Enforce login on every /api/* endpoint except the allowlist."""
    if not request.path.startswith("/api/"):
        return
    if request.method == "OPTIONS":  # CORS preflight
        return
    if request.path in PUBLIC_API_ENDPOINTS:
        return

    user = _get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    # Populate session so existing route handlers accessing session["user"] continue working seamlessly
    session["user"] = user


# ════════════════════════════════════════════════════════════════════
# LOGIN / LOGOUT & SESSION PROBE ROUTES
# ════════════════════════════════════════════════════════════════════

# ==============================================================================
# ROUTE: POST /api/login
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
# ==============================================================================
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    role = data.get("role", "admin")

    if role == "admin":
        username = data.get("username", "")
        password = data.get("password", "")
        if username == ADMIN_USER and password == ADMIN_PASS:
            user_info = {"role": "admin", "username": username}
            session["user"] = user_info
            token = auth_serializer.dumps(user_info)
            return jsonify({"ok": True, "role": "admin", "token": token, "username": username})
        return jsonify({"error": "Invalid credentials"}), 401

    elif role == "vendor":
        vendor_id = data.get("vendor_id", "").strip()
        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400
        vendor = COLS["vendors"].find_one({"vendor_id": vendor_id})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        user_info = {"role": "vendor", "vendor_id": vendor_id, "shop_name": vendor.get("shop_name", "")}
        session["user"] = user_info
        token = auth_serializer.dumps(user_info)
        return jsonify({
            "ok": True,
            "role": "vendor",
            "token": token,
            "vendor_id": vendor_id,
            "shop_name": vendor.get("shop_name", ""),
        })

    return jsonify({"error": "Invalid role"}), 400


# ==============================================================================
# ROUTE: POST /api/logout
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Clears the Flask server-side session, logging out the web client.
# ==============================================================================
@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ==============================================================================
# ROUTE: GET /api/me
# ------------------------------------------------------------------------------
# WHAT THIS DOES:
#   Session probe endpoint called by frontend applications on app launch or
#   page refresh to determine if the stored session/token is still valid.
# ==============================================================================
@app.route("/api/me")
def api_me():
    user = _get_authenticated_user()
    if not user:
        return jsonify({"loggedIn": False})
    return jsonify({"loggedIn": True, **user})
