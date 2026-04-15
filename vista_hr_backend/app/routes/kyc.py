"""
app/routes/kyc.py
-----------------
Handles:
  - Owner KYC document submission + admin review
  - Resident KYC document submission + admin review  (identity only, no discount)
  - Resident student verification submission + admin review  (unlocks discount)
  - Listing student_discount_pct update (owner only)
"""

from __future__ import annotations
import threading
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import User, Listing
from ..auth.jwt import require_role, require_auth
from ..utils.errors import json_error
from ..routes.notifications import create_notification
from ..utils.mail import (
    send_kyc_approved_email,
    send_kyc_rejected_email,
    send_student_approved_email,
    send_student_rejected_email,
)


def _send_async(fn, *args, **kwargs):
    t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
    t.start()


kyc_bp = Blueprint("kyc", __name__)


def _name(user: User) -> str:
    return f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email


def _kyc_val(user: User) -> str:
    return user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status or "NONE")


def _stu_val(user: User) -> str:
    return user.student_status.value if hasattr(user.student_status, "value") else str(user.student_status or "NONE")


# ══════════════════════════════════════════════════════════════
# OWNER — KYC SUBMISSION
# ══════════════════════════════════════════════════════════════

@kyc_bp.post("/kyc/submit")
@require_role("OWNER")
def kyc_submit():
    """Owner submits KYC document URLs (already uploaded to Cloudinary via /uploads/sign).
    Body: { id_front_url, id_back_url, selfie_url (optional) }
    """
    user: User = g.current_user
    data = request.get_json(silent=True) or {}

    id_front = (data.get("id_front_url") or "").strip()
    id_back  = (data.get("id_back_url")  or "").strip()
    selfie   = (data.get("selfie_url")   or "").strip() or None

    if not id_front or not id_back:
        return json_error("id_front_url and id_back_url are required", 400)

    if _kyc_val(user) == "APPROVED":
        return json_error("Your account is already verified.", 400)

    user.kyc_id_front_url  = id_front
    user.kyc_id_back_url   = id_back
    user.kyc_selfie_url    = selfie
    user.kyc_status        = "PENDING"
    user.kyc_submitted_at  = datetime.now(timezone.utc)
    user.kyc_reject_reason = None

    try:
        db.session.commit()
        return jsonify({"message": "KYC submitted. Pending admin review.", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@kyc_bp.get("/kyc/status")
@require_role("OWNER")
def kyc_status():
    user: User = g.current_user
    return jsonify({
        "kyc_status": _kyc_val(user),
        "kyc_reject_reason": user.kyc_reject_reason,
        "is_verified": bool(user.is_verified),
    }), 200


# ══════════════════════════════════════════════════════════════
# RESIDENT — KYC SUBMISSION  (identity verification, no discount)
# ══════════════════════════════════════════════════════════════

@kyc_bp.post("/resident/kyc/submit")
@require_role("RESIDENT")
def resident_kyc_submit():
    """Resident submits KYC document URLs for identity verification.
    Approval grants a verified resident badge — NOT a discount.
    Body: { id_front_url, id_back_url, selfie_url (optional) }
    """
    user: User = g.current_user
    data = request.get_json(silent=True) or {}

    id_front = (data.get("id_front_url") or "").strip()
    id_back  = (data.get("id_back_url")  or "").strip()
    selfie   = (data.get("selfie_url")   or "").strip() or None

    if not id_front or not id_back:
        return json_error("id_front_url and id_back_url are required", 400)

    if _kyc_val(user) == "APPROVED":
        return json_error("Your identity is already verified.", 400)

    user.kyc_id_front_url  = id_front
    user.kyc_id_back_url   = id_back
    user.kyc_selfie_url    = selfie
    user.kyc_status        = "PENDING"
    user.kyc_submitted_at  = datetime.now(timezone.utc)
    user.kyc_reject_reason = None

    try:
        db.session.commit()
        return jsonify({"message": "Identity documents submitted. Pending admin review.", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@kyc_bp.get("/resident/kyc/status")
@require_role("RESIDENT")
def resident_kyc_status():
    user: User = g.current_user
    return jsonify({
        "kyc_status": _kyc_val(user),
        "kyc_reject_reason": user.kyc_reject_reason,
        "is_verified": bool(user.is_verified),
    }), 200


# ══════════════════════════════════════════════════════════════
# ADMIN — KYC REVIEW (handles both OWNER and RESIDENT)
# ══════════════════════════════════════════════════════════════

@kyc_bp.get("/admin/kyc")
@require_role("ADMIN")
def admin_list_kyc():
    """List all users (OWNER or RESIDENT) who have submitted KYC.
    Optional ?status=PENDING|APPROVED|REJECTED|ALL  (default: PENDING)
    Optional ?role=OWNER|RESIDENT  (default: both)
    """
    status_filter = (request.args.get("status") or "PENDING").upper()
    role_filter   = (request.args.get("role")   or "ALL").upper()

    if status_filter not in {"PENDING", "APPROVED", "REJECTED", "ALL"}:
        status_filter = "PENDING"

    query = User.query.filter(User.role.in_(["OWNER", "RESIDENT"]))

    if role_filter in ("OWNER", "RESIDENT"):
        query = query.filter(User.role == role_filter)

    if status_filter != "ALL":
        query = query.filter(User.kyc_status == status_filter)
    else:
        query = query.filter(User.kyc_status != "NONE")

    users = query.order_by(User.kyc_submitted_at.desc()).all()

    result = []
    for u in users:
        role_val = u.role.value if hasattr(u.role, "value") else str(u.role)
        result.append({
            "id":                u.id,
            "name":              _name(u),
            "email":             u.email,
            "role":              role_val,
            "kyc_status":        _kyc_val(u),
            "kyc_id_front_url":  u.kyc_id_front_url,
            "kyc_id_back_url":   u.kyc_id_back_url,
            "kyc_selfie_url":    u.kyc_selfie_url,
            "kyc_submitted_at":  u.kyc_submitted_at.isoformat() if u.kyc_submitted_at else None,
            "kyc_reviewed_at":   u.kyc_reviewed_at.isoformat() if u.kyc_reviewed_at else None,
            "kyc_reject_reason": u.kyc_reject_reason,
            "is_verified":       bool(u.is_verified),
        })

    return jsonify({"kyc_applications": result}), 200


@kyc_bp.post("/admin/kyc/<int:user_id>/approve")
@require_role("ADMIN")
def admin_kyc_approve(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in ("OWNER", "RESIDENT"):
        return json_error("User must be an OWNER or RESIDENT.", 400)

    user.kyc_status        = "APPROVED"
    user.kyc_reviewed_at   = datetime.now(timezone.utc)
    user.kyc_reject_reason = None
    user.is_verified       = True

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # In-app notification
    create_notification(
        user_id=user.id,
        notif_type="KYC",
        title="Identity verified!",
        body="Your identity documents have been approved. Your account is now verified.",
    )

    # Email (non-fatal)
    try:
        _send_async(send_kyc_approved_email, user.email, _name(user))
    except Exception:
        pass

    return jsonify({"message": "KYC approved", "user_id": user_id}), 200


@kyc_bp.post("/admin/kyc/<int:user_id>/reject")
@require_role("ADMIN")
def admin_kyc_reject(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in ("OWNER", "RESIDENT"):
        return json_error("User must be an OWNER or RESIDENT.", 400)

    data   = request.get_json(silent=True) or {}
    reason = (data.get("reason") or "").strip() or "Documents were unclear or invalid."

    user.kyc_status        = "REJECTED"
    user.kyc_reviewed_at   = datetime.now(timezone.utc)
    user.kyc_reject_reason = reason
    user.is_verified       = False

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # In-app notification
    create_notification(
        user_id=user.id,
        notif_type="KYC",
        title="Identity verification rejected",
        body=f"Your documents were not accepted. Reason: {reason}",
    )

    try:
        _send_async(send_kyc_rejected_email, user.email, reason, _name(user))
    except Exception:
        pass

    return jsonify({"message": "KYC rejected", "user_id": user_id}), 200


# ══════════════════════════════════════════════════════════════
# RESIDENT — STUDENT VERIFICATION  (separate from KYC, unlocks discount)
# ══════════════════════════════════════════════════════════════

@kyc_bp.post("/student/submit")
@require_role("RESIDENT")
def student_submit():
    """Resident submits student docs (School ID + CoR), already uploaded to Cloudinary.
    Approval grants student badge + unlocks student discount on eligible listings.
    Body: { student_id_url, cor_url }
    """
    user: User = g.current_user
    data = request.get_json(silent=True) or {}

    student_id_url = (data.get("student_id_url") or "").strip()
    cor_url        = (data.get("cor_url")         or "").strip()

    if not student_id_url or not cor_url:
        return json_error("student_id_url and cor_url are required", 400)

    if _stu_val(user) == "APPROVED":
        return json_error("Student status already verified.", 400)

    user.student_id_url        = student_id_url
    user.student_cor_url       = cor_url
    user.student_status        = "PENDING"
    user.student_submitted_at  = datetime.now(timezone.utc)
    user.student_reject_reason = None

    try:
        db.session.commit()
        return jsonify({"message": "Student documents submitted. Pending admin review.", "user": user.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@kyc_bp.get("/student/status")
@require_role("RESIDENT")
def student_status():
    user: User = g.current_user
    return jsonify({
        "student_status":        _stu_val(user),
        "student_verified":      bool(user.student_verified),
        "student_reject_reason": user.student_reject_reason,
    }), 200


# ══════════════════════════════════════════════════════════════
# ADMIN — STUDENT REVIEW
# ══════════════════════════════════════════════════════════════

@kyc_bp.get("/admin/student")
@require_role("ADMIN")
def admin_list_students():
    """List residents who have submitted student verification.
    Optional ?status=PENDING|APPROVED|REJECTED|ALL  (default: PENDING)
    """
    status_filter = (request.args.get("status") or "PENDING").upper()
    if status_filter not in {"PENDING", "APPROVED", "REJECTED", "ALL"}:
        status_filter = "PENDING"

    query = User.query.filter(User.role == "RESIDENT")
    if status_filter != "ALL":
        query = query.filter(User.student_status == status_filter)
    else:
        query = query.filter(User.student_status != "NONE")

    residents = query.order_by(User.student_submitted_at.desc()).all()

    result = []
    for u in residents:
        result.append({
            "id":                    u.id,
            "name":                  _name(u),
            "email":                 u.email,
            "student_status":        _stu_val(u),
            "student_id_url":        u.student_id_url,
            "student_cor_url":       u.student_cor_url,
            "student_submitted_at":  u.student_submitted_at.isoformat() if u.student_submitted_at else None,
            "student_reviewed_at":   u.student_reviewed_at.isoformat() if u.student_reviewed_at else None,
            "student_reject_reason": u.student_reject_reason,
            "student_verified":      bool(u.student_verified),
        })

    return jsonify({"student_applications": result}), 200


@kyc_bp.post("/admin/student/<int:user_id>/approve")
@require_role("ADMIN")
def admin_student_approve(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val != "RESIDENT":
        return json_error("User is not a resident", 400)

    user.student_status        = "APPROVED"
    user.student_verified      = True
    user.student_reviewed_at   = datetime.now(timezone.utc)
    user.student_reject_reason = None

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # In-app notification
    create_notification(
        user_id=user.id,
        notif_type="STUDENT",
        title="Student verified!",
        body="Your student documents have been approved. You can now access student discounts on eligible listings.",
    )

    try:
        _send_async(send_student_approved_email, user.email, _name(user))
    except Exception:
        pass

    return jsonify({"message": "Student verified", "user_id": user_id}), 200


@kyc_bp.post("/admin/student/<int:user_id>/reject")
@require_role("ADMIN")
def admin_student_reject(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return json_error("User not found", 404)

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val != "RESIDENT":
        return json_error("User is not a resident", 400)

    data   = request.get_json(silent=True) or {}
    reason = (data.get("reason") or "").strip() or "Documents were unclear or invalid."

    user.student_status        = "REJECTED"
    user.student_verified      = False
    user.student_reviewed_at   = datetime.now(timezone.utc)
    user.student_reject_reason = reason

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # In-app notification
    create_notification(
        user_id=user.id,
        notif_type="STUDENT",
        title="Student verification rejected",
        body=f"Your student documents were not accepted. Reason: {reason}",
    )

    try:
        _send_async(send_student_rejected_email, user.email, reason, _name(user))
    except Exception:
        pass

    return jsonify({"message": "Student verification rejected", "user_id": user_id}), 200


# ══════════════════════════════════════════════════════════════
# OWNER — SET STUDENT DISCOUNT ON A LISTING
# ══════════════════════════════════════════════════════════════

@kyc_bp.patch("/listings/<int:listing_id>/student-discount")
@require_role("OWNER")
def set_student_discount(listing_id: int):
    """Owner sets or removes the student discount % on their listing.
    Stored in listing.capacity JSON under 'student_discount_pct'.
    Body: { discount: 10 }  (integer 0-100, or null to remove)
    """
    user: User = g.current_user
    listing = db.session.get(Listing, listing_id)

    if not listing or listing.owner_id != user.id:
        return json_error("Listing not found", 404)

    data     = request.get_json(silent=True) or {}
    discount = data.get("discount")

    # Capacity is a JSON field — mutate a copy and reassign to trigger SQLAlchemy change tracking
    capacity = dict(listing.capacity or {})

    if discount is None:
        capacity.pop("student_discount_pct", None)
    else:
        try:
            discount = int(discount)
            if not (0 <= discount <= 100):
                raise ValueError
        except (TypeError, ValueError):
            return json_error("discount must be an integer between 0 and 100", 400)
        capacity["student_discount_pct"] = discount

    listing.capacity = capacity

    try:
        db.session.commit()
        pct = capacity.get("student_discount_pct")
        return jsonify({"message": "Student discount updated", "student_discount_pct": pct}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)