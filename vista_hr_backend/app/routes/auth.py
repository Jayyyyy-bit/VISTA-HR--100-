from flask import Blueprint, request, jsonify
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import User
from ..auth.jwt import create_access_token
from ..utils.errors import json_error

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().upper()

    if not email or not password or role not in ("RESIDENT", "OWNER"):
        return json_error("Invalid payload. Required: email, password, role (RESIDENT|OWNER)", 400)

    if User.query.filter_by(email=email).first():
        return json_error("Email already registered", 409)

    user = User(email=email, role=role)
    user.set_password(password)

    # Owners need manual verification
    user.is_verified = (role != "OWNER")

    try:
        db.session.add(user)
        db.session.commit()
        token = create_access_token(user)
        return jsonify({"message": "Registered", "user": user.to_dict(), "access_token": token}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return json_error("Invalid payload. Required: email, password", 400)

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return json_error("Invalid credentials", 401)

    token = create_access_token(user)
    return jsonify({"message": "Logged in", "user": user.to_dict(), "access_token": token}), 200
