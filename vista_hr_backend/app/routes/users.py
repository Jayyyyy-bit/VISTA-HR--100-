from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import User
from ..auth.jwt import require_role
from ..utils.errors import json_error

users_bp = Blueprint("users", __name__)

VALID_ROLES = {"ADMIN", "OWNER", "RESIDENT"}


def serialize_user(user: User):
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    full_name = f"{first} {last}".strip() or user.email

    if getattr(user, "is_suspended", False):
        status = "SUSPENDED"
    elif not bool(user.is_verified):
        status = "PENDING"
    else:
        status = "ACTIVE"

    return {
        "id": user.id,
        "name": full_name,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "is_verified": bool(user.is_verified),
        "is_suspended": bool(getattr(user, "is_suspended", False)),
        "status": status,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


def split_name(full_name: str):
    raw = (full_name or "").strip()
    if not raw:
        return "", ""
    parts = raw.split()
    first = parts[0]
    last = " ".join(parts[1:]) if len(parts) > 1 else ""
    return first, last


@users_bp.get("/users")
@require_role("ADMIN")
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({"users": [serialize_user(u) for u in users]}), 200


@users_bp.post("/users")
@require_role("ADMIN")
def create_user():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "12345678").strip()
    role = (data.get("role") or "").strip().upper()
    is_verified = bool(data.get("is_verified", False))

    if not name or not email or not password or role not in VALID_ROLES:
        return json_error("Invalid payload. Required: name, email, password, role", 400)

    if User.query.filter_by(email=email).first():
        return json_error("Email already registered", 409)

    first_name, last_name = split_name(name)

    user = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        role=role,
        is_verified=is_verified if role != "ADMIN" else True,
        is_suspended=False,
    )
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()
        return jsonify({"message": "User created", "user": serialize_user(user)}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@users_bp.put("/users/<int:user_id>")
@require_role("ADMIN")
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return json_error("User not found", 404)

    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip().upper()
    is_verified = data.get("is_verified")
    is_suspended = data.get("is_suspended")

    if name:
        first_name, last_name = split_name(name)
        user.first_name = first_name
        user.last_name = last_name

    if email:
        existing = User.query.filter(User.email == email, User.id != user.id).first()
        if existing:
            return json_error("Email already registered", 409)
        user.email = email

    if role:
        if role not in VALID_ROLES:
            return json_error("Invalid role", 400)
        user.role = role
        if role == "ADMIN":
            user.is_verified = True

    current_role = user.role.value if hasattr(user.role, "value") else str(user.role)

    if is_verified is not None:
        if current_role == "ADMIN":
            user.is_verified = True
        else:
            user.is_verified = bool(is_verified)

    if is_suspended is not None:
        user.is_suspended = bool(is_suspended)

    try:
        db.session.commit()
        return jsonify({"message": "User updated", "user": serialize_user(user)}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@users_bp.delete("/users/<int:user_id>")
@require_role("ADMIN")
def delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return json_error("User not found", 404)

    if g.current_user.id == user.id:
        return json_error("You cannot delete your own admin account", 400)

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({"message": "User deleted"}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)