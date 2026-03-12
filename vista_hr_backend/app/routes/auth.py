from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import User
from ..auth.jwt import create_access_token, require_auth, COOKIE_NAME
from ..utils.errors import json_error

auth_bp = Blueprint("auth", __name__)


def _set_auth_cookie(resp, token: str):
    """
    Dev (http://127.0.0.1): Secure=False, SameSite=Lax works.
    Prod (https): set Secure=True + SameSite=None if cross-site.
    """
    is_prod = current_app.config.get("ENV") == "production"
    # if you deploy frontend and backend on different domains,
    # you'll likely need: samesite="None" and secure=True (HTTPS)
    resp.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=is_prod,          # dev False, prod True (HTTPS)
        samesite="Lax",          # dev safe default
        max_age=current_app.config.get("JWT_EXPIRES_MINUTES", 60) * 60,
        path="/",
    )
    return resp


# ======================================================
# REGISTER
# ======================================================
@auth_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().upper()

    # optional fields (you already send these from resident.js)
    first_name = (data.get("first_name") or "").strip() or None
    last_name = (data.get("last_name") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None

    if not email or not password or role not in ("RESIDENT", "OWNER"):
        return json_error("Invalid payload. Required: email, password, role (RESIDENT|OWNER)", 400)

    if User.query.filter_by(email=email).first():
        return json_error("Email already registered", 409)

    user = User(email=email, role=role)
    user.set_password(password)

    # save profile fields if provided
    user.first_name = first_name
    user.last_name = last_name
    user.phone = phone

    # Owners require manual verification
    user.is_verified = (role != "OWNER")

    try:
        db.session.add(user)
        db.session.commit()

        token = create_access_token(user)

        resp = jsonify({
            "message": "Registered",
            "user": user.to_dict(),
        })
        return _set_auth_cookie(resp, token), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        print("REGISTER ERROR:", e)
        return json_error("Database error", 500)


# ======================================================
# LOGIN
# ======================================================
@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().upper()  # optional

    if not email or not password:
        return json_error("Invalid payload. Required: email, password", 400)

    # If role is provided, match both. Otherwise login by email only.
    if role in ("RESIDENT", "OWNER"):
        user = User.query.filter_by(email=email, role=role).first()
    else:
        user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return json_error("Invalid credentials", 401)

    token = create_access_token(user)

    resp = jsonify({
        "message": "Logged in",
        "user": user.to_dict(),
    })
    return _set_auth_cookie(resp, token), 200

# ======================================================
# ME (cookie session check)
# ======================================================
@auth_bp.get("/auth/me")
@require_auth
def me():
    from flask import g
    return jsonify({"user": g.current_user.to_dict()}), 200


# ======================================================
# LOGOUT (clear cookie)
# ======================================================
@auth_bp.post("/auth/logout")
def logout():
    resp = jsonify({"message": "Logged out"})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp, 200
