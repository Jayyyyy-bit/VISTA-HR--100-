from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
import os
import re
import cloudinary.uploader

from ..extensions import db
from ..models import User
from ..auth.jwt import require_role
from ..utils.errors import json_error

users_bp = Blueprint("users", __name__)

MAX_STRIKES = 5

VALID_ROLES = {"ADMIN", "OWNER", "RESIDENT"}

# ── Avatar face validation ────────────────────────────────────────────────────

def _extract_cloudinary_public_id(secure_url: str) -> str | None:
    """
    Derive Cloudinary public_id from a secure_url so we can delete it.
    URL format: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<folder>/<filename>.<ext>
    public_id = <folder>/<filename>  (no extension, no version segment)
    """
    try:
        url = secure_url.split("?")[0]
        match = re.search(r"/upload/(?:v\d+/)?(.+)$", url)
        if not match:
            return None
        path = match.group(1)
        public_id, _ = path.rsplit(".", 1) if "." in path else (path, "")
        return public_id
    except Exception:
        return None


def _delete_cloudinary_asset(secure_url: str) -> None:
    """
    Silently destroy a Cloudinary asset by its secure_url.
    Called when the backend rejects an avatar that has already been uploaded.
    """
    public_id = _extract_cloudinary_public_id(secure_url)
    if public_id:
        try:
            cloudinary.uploader.destroy(public_id)
        except Exception:
            pass  # Non-fatal — orphaned asset is acceptable over blocking the response


def serialize_user(user: User):
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    full_name = f"{first} {last}".strip() or user.email

    if not getattr(user, "is_active", True):
        status = "DEACTIVATED"
    elif getattr(user, "is_suspended", False):
        status = "SUSPENDED"
    elif not bool(user.is_verified):
        status = "PENDING"
    else:
        status = "ACTIVE"

    kyc_val = None
    stu_val = None
    if hasattr(user, "kyc_status"):
        kyc_val = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status or "NONE")
    if hasattr(user, "student_status"):
        stu_val = user.student_status.value if hasattr(user.student_status, "value") else str(user.student_status or "NONE")

    return {
        "id": user.id,
        "name": full_name,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "is_verified": bool(user.is_verified),
        "is_suspended": bool(getattr(user, "is_suspended", False)),
        "is_active": bool(getattr(user, "is_active", True)),
        "status": status,
        "kyc_status": kyc_val,
        "student_status": stu_val,
        "student_verified":  bool(getattr(user, "student_verified", False)),
        "strike_count":      int(getattr(user, "strike_count", 0) or 0),
        "suspended_until":   user.suspended_until.isoformat() if getattr(user, "suspended_until", None) else None,
        "suspension_reason": getattr(user, "suspension_reason", None),
        "email_verified":    bool(getattr(user, "email_verified", False)),
        "kyc_id_front_url":  getattr(user, "kyc_id_front_url", None),
        "kyc_id_back_url":   getattr(user, "kyc_id_back_url", None),
        "kyc_selfie_url":    getattr(user, "kyc_selfie_url", None),
        "kyc_reject_reason": getattr(user, "kyc_reject_reason", None),
        "kyc_submitted_at":  user.kyc_submitted_at.isoformat() if getattr(user, "kyc_submitted_at", None) else None,
        "student_id_url":    getattr(user, "student_id_url", None),
        "student_cor_url":   getattr(user, "student_cor_url", None),
        "student_reject_reason": getattr(user, "student_reject_reason", None),
        "created_at":        user.created_at.isoformat() if user.created_at else None,
        "updated_at":        user.updated_at.isoformat() if user.updated_at else None,
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
    # Exclude deactivated users by default; ?include_deactivated=true shows all
    include_deactivated = request.args.get("include_deactivated", "").lower() == "true"
    query = User.query
    if not include_deactivated:
        query = query.filter(User.is_active == True)  # noqa: E712
    users = query.order_by(User.created_at.desc()).all()
    return jsonify({"users": [serialize_user(u) for u in users]}), 200


@users_bp.post("/users")
@require_role("ADMIN")
def create_user():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    role = (data.get("role") or "").strip().upper()
    is_verified = bool(data.get("is_verified", False))

    if not name or not email or not password or role not in VALID_ROLES:
        return json_error("Invalid payload. Required: name, email, password, role", 400)

    if len(password) < 8:
        return json_error("Validation failed", 400, fields={"password": "Password must be at least 8 characters."})

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
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    data = request.get_json(silent=True) or {}

    # Guard: admin cannot alter their own role or suspend themselves
    is_self = (user.id == g.current_user.id)

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip().upper()
    is_verified = data.get("is_verified")
    is_suspended = data.get("is_suspended")

    if is_self and role and role != (user.role.value if hasattr(user.role, "value") else str(user.role)):
        return json_error("You cannot change your own role.", 400)
    if is_self and is_suspended:
        return json_error("You cannot suspend your own account.", 400)

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
            new_verified = bool(is_verified)
            user.is_verified = new_verified
            # Keep kyc_status in sync when admin manually verifies/unverifies an owner
            if current_role == "OWNER":
                kyc_val = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status or "NONE")
                if new_verified and kyc_val not in ("APPROVED",):
                    user.kyc_status = "APPROVED"
                elif not new_verified and kyc_val == "APPROVED":
                    user.kyc_status = "REJECTED"

    if is_suspended is not None:
        user.is_suspended = bool(is_suspended)
        if bool(is_suspended):
            sus_until_raw = data.get("suspended_until")
            if sus_until_raw:
                try:
                    from datetime import datetime as _dt
                    sus_dt = _dt.fromisoformat(str(sus_until_raw).replace("Z", "+00:00"))
                    user.suspended_until = sus_dt
                except ValueError:
                    user.suspended_until = None
            else:
                user.suspended_until = None
            reason = (data.get("suspension_reason") or "").strip() or None
            user.suspension_reason = reason
            current_strikes = int(getattr(user, "strike_count", 0) or 0)
            if bool(data.get("add_strike", True)):
                current_strikes = min(current_strikes + 1, MAX_STRIKES)
                user.strike_count = current_strikes
        else:
            user.suspended_until   = None
            user.suspension_reason = None

    try:
        db.session.commit()
        return jsonify({"message": "User updated", "user": serialize_user(user)}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@users_bp.patch("/users/<int:user_id>")
@require_role("ADMIN")
def patch_user(user_id: int):
    """Partial update — used for suspend/uplift/strike operations."""
    data = request.get_json(silent=True) or {}
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    me = g.current_user
    if me.id == user_id and data.get("is_suspended"):
        return json_error("You cannot suspend your own account.", 400)

    is_suspended = data.get("is_suspended")
    if is_suspended is not None:
        user.is_suspended = bool(is_suspended)
        if bool(is_suspended):
            sus_until_raw = data.get("suspended_until")
            if sus_until_raw:
                try:
                    from datetime import datetime as _dt
                    sus_dt = _dt.fromisoformat(str(sus_until_raw).replace("Z", "+00:00"))
                    user.suspended_until = sus_dt
                except ValueError:
                    user.suspended_until = None
            else:
                user.suspended_until = None
            reason = (data.get("suspension_reason") or "").strip() or None
            user.suspension_reason = reason
            current_strikes = int(getattr(user, "strike_count", 0) or 0)
            if bool(data.get("add_strike", True)):
                current_strikes = min(current_strikes + 1, MAX_STRIKES)
                user.strike_count = current_strikes
        else:
            user.suspended_until   = None
            user.suspension_reason = None

    try:
        db.session.commit()
        return jsonify({"message": "Updated", "user": serialize_user(user)}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)


@users_bp.delete("/users/<int:user_id>")
@require_role("ADMIN")
def delete_user(user_id):
    """Soft-delete: sets is_active = False instead of removing the row."""
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    if g.current_user.id == user.id:
        return json_error("You cannot deactivate your own admin account", 400)

    if not getattr(user, "is_active", True):
        return json_error("User is already deactivated", 400)

    user.is_active = False
    # Bump token_version to invalidate all their active sessions immediately
    user.token_version = int(user.token_version or 0) + 1

    try:
        db.session.commit()
        return jsonify({"message": "User deactivated", "user": serialize_user(user)}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@users_bp.post("/admin/users/<int:user_id>/reactivate")
@require_role("ADMIN")
def reactivate_user(user_id: int):
    """Re-enable a soft-deleted user account."""
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    if getattr(user, "is_active", True):
        return json_error("User is already active", 400)

    user.is_active = True

    try:
        db.session.commit()
        return jsonify({"message": "User reactivated", "user": serialize_user(user)}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══ Self-service — logged-in user's own account ══════════════════════════════
# These routes use @require_auth directly (not @require_role) so any
# authenticated role (OWNER, RESIDENT, ADMIN) can manage their own account.
from ..auth.jwt import require_auth  # noqa: E402


@users_bp.patch("/users/me/profile")
@require_auth
def update_own_profile():
    """PATCH /api/users/me/profile — update first_name, last_name, phone, based_in.
    Phone is locked (400) if the user is an OWNER with KYC PENDING or APPROVED.
    """
    user = g.current_user
    data = request.get_json(silent=True) or {}

    first_name = (data.get("first_name") or "").strip() or None
    last_name  = (data.get("last_name")  or "").strip() or None
    phone      = (data.get("phone")      or "").strip() or None
    based_in   = (data.get("based_in")   or "").strip() or None

    if not first_name and not last_name:
        return json_error("At least first name or last name is required.", 400)

    # Phone lock: OWNER with KYC PENDING or APPROVED cannot change phone
    if phone and phone != user.phone:
        role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        kyc_val  = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status or "NONE")
        if role_val == "OWNER" and kyc_val in ("PENDING", "APPROVED"):
            return json_error("Phone number is locked while KYC is pending or approved.", 403)

    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if phone is not None:
        user.phone = phone
    if based_in is not None:
        user.based_in = based_in

    try:
        db.session.commit()
        return jsonify({"message": "Profile updated.", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)


@users_bp.patch("/users/me/avatar")
@require_auth
def update_own_avatar():
    """PATCH /api/users/me/avatar — save Cloudinary avatar URL after client-side upload.
    The frontend uploads directly to Cloudinary (signed), then sends us the secure_url.

    Backend re-validates that the image contains a human face using Claude Vision.
    If the check fails, the Cloudinary asset is deleted automatically and a 422 is returned.
    """
    user = g.current_user
    data = request.get_json(silent=True) or {}

    avatar_url = (data.get("avatar_url") or "").strip() or None

    # Basic guard — must be a Cloudinary URL or null (to remove avatar)
    if avatar_url and not avatar_url.startswith("https://res.cloudinary.com/"):
        return json_error("Invalid avatar URL.", 400)

    # ── Backend face check — trust the frontend face-api.js result ──────────
    # Frontend sends face_detected=True only after face-api.js confirms a face.
    # If face_detected is explicitly False, reject and delete the Cloudinary asset.
    if avatar_url:
        face_detected = data.get("face_detected")
        if face_detected is False:
            _delete_cloudinary_asset(avatar_url)
            return json_error("Profile photo must clearly show your face.", 422)

    user.avatar_url = avatar_url

    try:
        db.session.commit()
        return jsonify({"message": "Avatar updated.", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)


@users_bp.post("/users/me/logout-all")
@require_auth
def logout_all_devices():
    """POST /api/users/me/logout-all — bumps token_version, invalidating all existing JWTs."""
    user = g.current_user
    user.token_version = int(user.token_version or 0) + 1

    try:
        db.session.commit()
        # Clear the current session cookie too
        from flask import make_response
        resp = make_response(jsonify({"message": "Logged out from all devices."}), 200)
        resp.delete_cookie(
            "access_token",
            path="/",
            samesite="Lax",
        )
        return resp
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)


@users_bp.post("/users/me/deactivate")
@require_auth
def deactivate_own_account():
    """Self-service account deactivation. Blocked if user has active bookings."""
    from ..models.booking import Booking

    user = g.current_user
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)

    # Check for active bookings — block deactivation if any exist
    active_statuses = ("PENDING", "APPROVED", "ACTIVE")
    if role_val == "OWNER":
        # Owner: check bookings on their listings
        from ..models.listing import Listing
        owner_listing_ids = [l.id for l in Listing.query.filter_by(owner_id=user.id).all()]
        if owner_listing_ids:
            active_bookings = Booking.query.filter(
                Booking.listing_id.in_(owner_listing_ids),
                Booking.status.in_(active_statuses),
            ).count()
            if active_bookings > 0:
                return json_error(
                    f"Cannot deactivate: you have {active_bookings} active booking(s) on your listings. "
                    "Please resolve them first.",
                    409,
                )
    else:
        # Resident: check their own bookings
        active_bookings = Booking.query.filter(
            Booking.resident_id == user.id,
            Booking.status.in_(active_statuses),
        ).count()
        if active_bookings > 0:
            return json_error(
                f"Cannot deactivate: you have {active_bookings} active booking(s). "
                "Please cancel or complete them first.",
                409,
            )

    user.is_active = False
    user.token_version = int(user.token_version or 0) + 1

    try:
        db.session.commit()
        from flask import make_response
        from ..auth.jwt import clear_auth_cookie
        resp = make_response(jsonify({"message": "Account deactivated."}), 200)
        clear_auth_cookie(resp)
        return resp
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)

@users_bp.post("/admin/users/<int:user_id>/reset-strikes")
@require_role("ADMIN")
def reset_strikes(user_id: int):
    """Admin resets strike count for a user."""
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)
    user.strike_count = 0
    try:
        db.session.commit()
        return jsonify({"message": "Strikes reset", "strike_count": 0}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)