import threading
from flask import Blueprint, request, jsonify, current_app, g
from sqlalchemy.exc import SQLAlchemyError
import random, string
from datetime import datetime, timedelta, timezone

from ..extensions import db
from ..models import User
from ..auth.jwt import create_access_token, require_auth, COOKIE_NAME
from ..utils.errors import json_error
from ..utils.mail import send_otp_email

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


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _attach_otp(user: User) -> str:
    otp = _generate_otp()
    user.email_otp = otp
    user.email_otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    return otp



def _send_async(fn, *args, **kwargs):
    """Fire-and-forget email in a background thread so signup doesn't block."""
    t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
    t.start()

# ======================================================
# REGISTER
# ======================================================
@auth_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().upper()

    first_name = (data.get("first_name") or "").strip() or None
    last_name  = (data.get("last_name")  or "").strip() or None
    phone      = (data.get("phone")      or "").strip() or None

    if not email or not password or role not in ("RESIDENT", "OWNER"):
        return json_error("Invalid payload. Required: email, password, role (RESIDENT|OWNER)", 400)

    if User.query.filter_by(email=email).first():
        return json_error("Email already registered", 409)

    user = User(email=email, role=role)
    user.set_password(password)
    user.first_name   = first_name
    user.last_name    = last_name
    user.phone        = phone
    user.email_verified = False
    user.is_verified  = False   # owners need KYC; residents get True after email verify
    user.is_suspended = False
    user.kyc_status   = "NONE"
    user.student_status = "NONE"

    otp = _attach_otp(user)

    try:
        db.session.add(user)
        db.session.commit()

        # Send OTP email (non-fatal — user can resend)
        try:
            display_name = f"{first_name or ''} {last_name or ''}".strip() or email
            _send_async(send_otp_email, email, otp, display_name)
        except Exception as mail_err:
            current_app.logger.warning(f"OTP email failed for {email}: {mail_err}")

        token = create_access_token(user)
        resp = jsonify({"message": "Registered", "user": user.to_dict()})
        return _set_auth_cookie(resp, token), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        current_app.logger.error(f"REGISTER ERROR: {e}")
        return json_error("Database error", 500)


# ======================================================
# LOGIN
# ======================================================
@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}

    email    = (data.get("email")    or "").strip().lower()
    password = data.get("password")  or ""
    role     = (data.get("role")     or "").strip().upper()

    if not email or not password:
        return json_error("Invalid payload. Required: email, password", 400)

    if role in ("ADMIN", "RESIDENT", "OWNER"):
        user = User.query.filter_by(email=email, role=role).first()
    else:
        user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return json_error("Invalid credentials", 401)

    if getattr(user, "is_suspended", False):
        return json_error("Account suspended", 403)

    # Allow login even if email not verified — actions are gated per role on dashboard
    token = create_access_token(user)
    resp = jsonify({"message": "Logged in", "user": user.to_dict()})
    return _set_auth_cookie(resp, token), 200


# ======================================================
# SEND / RESEND OTP
# ======================================================
@auth_bp.post("/auth/send-otp")
def send_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return json_error("Email required", 400)

    user = User.query.filter_by(email=email).first()
    if not user:
        # Don't reveal whether email exists
        return jsonify({"message": "If that email is registered, a code was sent."}), 200

    if bool(user.email_verified):
        return json_error("Email already verified", 400)

    # Rate-limit: don't resend if current OTP is still fresh (< 60s old)
    if user.email_otp_expires_at:
        expires = user.email_otp_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        remaining = (expires - datetime.now(timezone.utc)).total_seconds()
        if remaining > 540:   # 600s max - 60s cooldown = 540s
            return json_error("Please wait before requesting a new code.", 429)

    otp = _attach_otp(user)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    try:
        name = f"{user.first_name or ''} {user.last_name or ''}".strip() or email
        _send_async(send_otp_email, email, otp, name)
    except Exception as mail_err:
        current_app.logger.warning(f"OTP resend failed for {email}: {mail_err}")
        return json_error("Failed to send email. Check mail configuration.", 500)

    return jsonify({"message": "Verification code sent."}), 200


# ======================================================
# VERIFY EMAIL (submit OTP)
# ======================================================
@auth_bp.post("/auth/verify-email")
def verify_email():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp")   or "").strip()

    if not email or not otp:
        return json_error("Email and OTP required", 400)

    user = User.query.filter_by(email=email).first()
    if not user:
        return json_error("Invalid code", 400)

    if bool(user.email_verified):
        return json_error("Email already verified", 400)

    if not user.email_otp or user.email_otp != otp:
        return json_error("Incorrect verification code", 400)

    expires = user.email_otp_expires_at
    if expires is None:
        return json_error("Verification code expired", 400)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        return json_error("Verification code expired", 400)

    # Mark email verified
    user.email_verified   = True
    user.email_otp        = None
    user.email_otp_expires_at = None

    # Residents are fully verified after email OTP — no KYC needed
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val == "RESIDENT":
        user.is_verified = True

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    token = create_access_token(user)
    resp = jsonify({"message": "Email verified", "user": user.to_dict()})
    return _set_auth_cookie(resp, token), 200

# ======================================================
# ME (cookie session check)
# ======================================================
@auth_bp.get("/auth/me")
@require_auth
def me():
    return jsonify({"user": g.current_user.to_dict()}), 200




# ======================================================
# UPDATE PROFILE (name, phone)
# ======================================================
@auth_bp.patch("/auth/me/profile")
@require_auth
def update_profile():
    user = g.current_user
    data = request.get_json(silent=True) or {}

    first = (data.get("first_name") or "").strip() or None
    last  = (data.get("last_name")  or "").strip() or None
    phone = (data.get("phone")      or "").strip() or None

    if first is not None: user.first_name = first
    if last  is not None: user.last_name  = last
    if phone is not None: user.phone      = phone

    try:
        db.session.commit()
        return jsonify({"message": "Profile updated", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

# ======================================================
# LOGOUT (clear cookie)
# ======================================================
@auth_bp.post("/auth/logout")
def logout():
    resp = jsonify({"message": "Logged out"})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp, 200