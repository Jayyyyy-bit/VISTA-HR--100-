import hashlib
import threading
from flask import Blueprint, request, jsonify, current_app, g
from sqlalchemy.exc import SQLAlchemyError
import random, string
from datetime import datetime, timedelta, timezone



from ..extensions import db
from ..models import User
from ..auth.jwt import create_access_token, require_auth, COOKIE_NAME
from ..utils.errors import json_error
from ..utils.mail import send_otp_email, send_password_reset_email

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


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

def _attach_otp(user: User) -> str:
    otp = _generate_otp()
    user.email_otp = _hash_otp(otp)   # store hash, never plaintext
    user.email_otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    return otp  # plaintext returned for emailing



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

    if len(password) < 8:
        return json_error("Validation failed", 400, fields={"password": "Password must be at least 8 characters."})

    existing = User.query.filter_by(email=email).first()
    if existing:
        # Option A — deactivated account: reactivate with new credentials
        if not getattr(existing, "is_active", True):
            if existing.role.value if hasattr(existing.role, "value") else str(existing.role) != role:
                return json_error(
                    "This email was previously registered as a different role. "
                    "Please use a different email.", 409
                )
            existing.set_password(password)
            existing.first_name     = first_name
            existing.last_name      = last_name
            existing.phone          = phone
            existing.is_active      = True
            existing.is_verified    = False
            existing.email_verified = False
            existing.is_suspended   = False
            existing.kyc_status     = "NONE"
            existing.student_status = "NONE"
            existing.token_version  = int(existing.token_version or 0) + 1
            otp = _attach_otp(existing)
            try:
                db.session.commit()
                display_name = f"{first_name or ''} {last_name or ''}".strip() or email
                _send_async(send_otp_email, email, otp, display_name)
            except SQLAlchemyError:
                db.session.rollback()
                return json_error("Database error", 500)
            token = create_access_token(existing)
            resp = jsonify({"message": "Account reactivated", "user": existing.to_dict()})
            return _set_auth_cookie(resp, token), 201

        # Option B — active account exists: clear error by state
        if getattr(existing, "is_suspended", False):
            return json_error(
                "This email is associated with a suspended account. "
                "Please contact support.", 409,
                code="ACCOUNT_SUSPENDED"
            )
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

    # Block deactivated (soft-deleted) accounts from logging in
    if not getattr(user, "is_active", True):
        return json_error("This account has been deactivated.", 403,
                          code="ACCOUNT_DEACTIVATED")

    if getattr(user, "is_suspended", False):
        sus_until = getattr(user, "suspended_until", None)
        reason    = getattr(user, "suspension_reason", None) or "Violation of platform terms."
        strikes   = int(getattr(user, "strike_count", 0) or 0)

        if sus_until:
            if sus_until.tzinfo is None:
                from datetime import timezone as _tz
                sus_until = sus_until.replace(tzinfo=_tz.utc)
            if datetime.now(timezone.utc) >= sus_until:
                # Auto-lift — suspension period ended
                user.is_suspended    = False
                user.suspended_until = None
                try: db.session.commit()
                except: db.session.rollback()
                # Fall through — allow login
            else:
                until_str = sus_until.strftime("%B %d, %Y")
                msg = f"Your account is suspended until {until_str}. Reason: {reason}"
                return json_error(msg, 403, code="ACCOUNT_SUSPENDED",
                                  fields={"strikes": strikes})
        else:
            msg = "Your account has been permanently suspended."
            if reason: msg += f" Reason: {reason}"
            return json_error(msg, 403, code="ACCOUNT_SUSPENDED",
                              fields={"strikes": strikes})

    # Allow login even if email not verified — actions are gated per role on dashboard
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
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
        current_app.logger.error(f"OTP email failed: {mail_err}")
        # Still return 200 — OTP is saved in DB, user can retry

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

    if not user.email_otp or user.email_otp != _hash_otp(otp):
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
# CHANGE PASSWORD
# ======================================================
@auth_bp.patch("/auth/me/password")
@require_auth
def change_password():
    user = g.current_user
    data = request.get_json(silent=True) or {}

    current = (data.get("current_password") or "").strip()
    new_pw  = (data.get("new_password")     or "").strip()
    confirm = (data.get("confirm_password") or "").strip()

    if not current:
        return json_error("Validation failed", 400, fields={"current_password": "Current password is required."})
    if not new_pw:
        return json_error("Validation failed", 400, fields={"new_password": "New password is required."})
    if len(new_pw) < 8:
        return json_error("Validation failed", 400, fields={"new_password": "Password must be at least 8 characters."})
    if new_pw != confirm:
        return json_error("Validation failed", 400, fields={"confirm_password": "Passwords do not match."})
    if not user.check_password(current):
        return json_error("Validation failed", 400, fields={"current_password": "Incorrect current password."})
    if user.check_password(new_pw):
        return json_error("Validation failed", 400, fields={"new_password": "New password must be different from current."})

    user.set_password(new_pw)
    try:
        db.session.commit()
        return jsonify({"message": "Password updated successfully."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)




# ======================================================
# MARK ONBOARDING COMPLETE
# ======================================================
@auth_bp.patch("/auth/me/onboarding")
@require_auth
def complete_onboarding():
    user = g.current_user
    if not bool(getattr(user, "has_completed_onboarding", False)):
        user.has_completed_onboarding = True
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            return json_error("Database error", 500)
    return jsonify({"message": "Onboarding marked complete", "user": user.to_dict()}), 200

# ======================================================
# LOGOUT (clear cookie)
# ======================================================
@auth_bp.post("/auth/logout")
def logout():
    resp = jsonify({"message": "Logged out"})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp, 200

# ══════════════════════════════════════════════════════════
# FORGOT PASSWORD — Step 1: Look up account (Meta-style)
# Returns masked user info so user can confirm "is this you?"
# Does NOT send OTP yet — prevents email enumeration abuse
# ══════════════════════════════════════════════════════════
@auth_bp.post("/auth/forgot-password")
def forgot_password():
    """Look up account by email. Returns masked name + email for confirmation."""
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return json_error("Email is required.", 400)

    user = User.query.filter_by(email=email).first()

    # Always return 200 with same shape to prevent email enumeration
    if not user:
        return jsonify({
            "found": False,
            "message": "No account found with that email address.",
        }), 200

    # Mask the display name: "Juan D." or just "User"
    first = (user.first_name or "").strip()
    last  = (user.last_name  or "").strip()
    masked_name = f"{first} {last[0]}." if first and last else (first or "Account holder")

    # Mask the email: c***o@gmail.com
    parts     = email.split("@")
    local     = parts[0]
    domain    = parts[1] if len(parts) > 1 else ""
    if len(local) <= 2:
        masked_email = local[0] + "***@" + domain
    else:
        masked_email = local[0] + ("*" * (len(local) - 2)) + local[-1] + "@" + domain

    role = str(user.role.value if hasattr(user.role, "value") else user.role)

    return jsonify({
        "found":        True,
        "masked_name":  masked_name,
        "masked_email": masked_email,
        "role":         role,
    }), 200


# ══════════════════════════════════════════════════════════
# FORGOT PASSWORD — Step 2: User confirmed → Send OTP
# ══════════════════════════════════════════════════════════
@auth_bp.post("/auth/forgot-password/send-otp")
def forgot_password_send_otp():
    """User confirmed their identity — now actually send the reset OTP."""
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return json_error("Email is required.", 400)

    user = User.query.filter_by(email=email).first()
    if not user:
        # Still 200 to prevent enumeration
        return jsonify({"message": "Reset code sent."}), 200

    otp = _attach_otp(user)   # stores sha256(otp) in DB
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    name = f"{user.first_name or ''} {user.last_name or ''}".strip() or ""
    _send_async(send_password_reset_email, email, otp, name)

    return jsonify({"message": "Reset code sent."}), 200


# ══════════════════════════════════════════════════════════
# FORGOT PASSWORD — Step 2: Verify OTP
# ══════════════════════════════════════════════════════════
@auth_bp.post("/auth/verify-reset-otp")
def verify_reset_otp():
    """Verify the reset OTP — returns a short-lived reset token."""
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp")   or "").strip()

    if not email or not otp:
        return json_error("Email and OTP are required.", 400)

    user = User.query.filter_by(email=email).first()
    if not user or not user.email_otp:
        return json_error("Invalid or expired reset code.", 400)

    if user.email_otp != _hash_otp(otp):
        return json_error("Invalid reset code.", 400)

    expires = user.email_otp_expires_at
    if expires:
        if expires.tzinfo is None:
            from datetime import timezone as tz
            expires = expires.replace(tzinfo=tz.utc)
        if datetime.now(timezone.utc) > expires:
            return json_error("Reset code has expired. Please request a new one.", 400)

    # OTP valid — clear it so it can only be used once
    # Generate a temporary reset token (reuse OTP slot with a special prefix)
    import secrets
    reset_token = secrets.token_urlsafe(32)
    user.email_otp = _hash_otp(reset_token)  # store hash of reset token
    user.email_otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    return jsonify({"message": "OTP verified.", "reset_token": reset_token}), 200


# ══════════════════════════════════════════════════════════
# FORGOT PASSWORD — Step 3: Set new password
# ══════════════════════════════════════════════════════════
@auth_bp.post("/auth/reset-password")
def reset_password():
    """Set a new password using the reset token from step 2."""
    data         = request.get_json(silent=True) or {}
    email        = (data.get("email")        or "").strip().lower()
    reset_token  = (data.get("reset_token")  or "").strip()
    new_password     = (data.get("new_password")     or "").strip()
    confirm_password = (data.get("confirm_password") or "").strip()

    if not email or not reset_token or not new_password:
        return json_error("Email, reset token, and new password are required.", 400)

    if len(new_password) < 8:
        return json_error("Validation failed", 400,
                          fields={"new_password": "Password must be at least 8 characters."})

    if confirm_password and new_password != confirm_password:
        return json_error("Validation failed", 400,
                          fields={"confirm_password": "Passwords do not match."})

    user = User.query.filter_by(email=email).first()
    if not user or not user.email_otp:
        return json_error("Invalid or expired reset session. Please start again.", 400)

    if user.email_otp != _hash_otp(reset_token):
        return json_error("Invalid reset token.", 400)

    expires = user.email_otp_expires_at
    if expires:
        if expires.tzinfo is None:
            from datetime import timezone as tz
            expires = expires.replace(tzinfo=tz.utc)
        if datetime.now(timezone.utc) > expires:
            return json_error("Reset session expired. Please start again.", 400)

    # Set new password + clear OTP
    user.set_password(new_password)
    user.email_otp            = None
    user.email_otp_expires_at = None

    try:
        db.session.commit()
        return jsonify({"message": "Password reset successfully. You can now log in."}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)