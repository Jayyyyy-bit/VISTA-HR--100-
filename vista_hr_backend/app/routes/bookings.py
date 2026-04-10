from __future__ import annotations

from datetime import date, datetime, timezone

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import Listing, Booking
from ..models.user import User
from ..auth.jwt import require_role, require_auth
from ..utils.errors import json_error

from ..routes.notifications import create_notification

bookings_bp = Blueprint("bookings", __name__)

# ── Constants ─────────────────────────────────────────────
LIVE_STATUSES = ("PENDING", "APPROVED", "ACTIVE")
RECEIPT_STATUSES = ("APPROVED", "ACTIVE", "COMPLETED")


# ══════════════════════════════════════════════════════════
# RESIDENT: Request a booking
# ══════════════════════════════════════════════════════════

@bookings_bp.post("/bookings")
@require_role("RESIDENT")
def create_booking():
    data = request.get_json(silent=True) or {}
    user = g.current_user

    # Soft gate — must verify email before booking
    if not bool(getattr(user, "email_verified", False)):
        return json_error(
            "Please verify your email before making a booking request.",
            403,
            code="EMAIL_NOT_VERIFIED"
        )

    listing_id = data.get("listing_id")
    move_in_raw = data.get("move_in_date")
    move_out_raw = data.get("move_out_date")
    message = (data.get("message") or "").strip() or None

    # ── Validate listing_id ──
    if not listing_id or not isinstance(listing_id, int):
        return json_error("Validation failed", 400, fields={"listing_id": "Required integer."})

    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found or unavailable", 404)

    # ── Guard: 1 live reservation per resident ──
    live_booking = (
        Booking.query
        .filter(
            Booking.resident_id == user.id,
            Booking.status.in_(LIVE_STATUSES),
        )
        .first()
    )
    if live_booking:
        return json_error(
            "You already have an active reservation. Cancel or complete it before reserving again.",
            409,
        )

    # ── Guard: listing already occupied ──
    listing_active = (
        Booking.query
        .filter(
            Booking.listing_id == listing_id,
            Booking.status == "ACTIVE",
        )
        .first()
    )
    if listing_active:
        return json_error("This listing is currently occupied.", 409)

    # Validate move_in_date (optional but if provided must be valid)
    move_in = None
    if move_in_raw:
        try:
            move_in = date.fromisoformat(str(move_in_raw))
            if move_in < date.today():
                return json_error("Validation failed", 400, fields={"move_in_date": "Move-in date cannot be in the past."})
        except ValueError:
            return json_error("Validation failed", 400, fields={"move_in_date": "Must be a valid date (YYYY-MM-DD)."})

    #  Validate move_out_date (optional, must be after move_in if both provided)
    move_out = None
    if move_out_raw:
        try:
            move_out = date.fromisoformat(str(move_out_raw))
            if move_in and move_out <= move_in:
                return json_error("Validation failed", 400, fields={"move_out_date": "Move-out date must be after move-in date."})
        except ValueError:
            return json_error("Validation failed", 400, fields={"move_out_date": "Must be a valid date (YYYY-MM-DD)."})

    #  Prevent duplicate PENDING booking for same listing
    existing = Booking.query.filter_by(
        listing_id=listing_id,
        resident_id=user.id,
        status="PENDING",
    ).first()
    if existing:
        return json_error("You already have a pending booking for this listing.", 409)

    booking = Booking(
        listing_id=listing_id,
        resident_id=user.id,
        status="PENDING",
        move_in_date=move_in,
        move_out_date=move_out,
        message=message,
    )

    try:
        db.session.add(booking)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # Notify owner in-app — use db.session.get (Listing has no .owner backref)
    owner = db.session.get(User, listing.owner_id)
    listing_title = listing.title or f"Listing #{listing_id}"
    resident_full = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email

    create_notification(
        user_id=owner.id,
        notif_type="BOOKING_SUBMITTED",
        title="New reservation request",
        body=f"{resident_full} wants to reserve '{listing_title}'",
    )

    return jsonify({"message": "Reservation request submitted", "booking": booking.to_dict()}), 201


# ══════════════════════════════════════════════════════════
# RESIDENT: Live reservation status check
# ══════════════════════════════════════════════════════════

@bookings_bp.get("/bookings/me/status")
@require_role("RESIDENT")
def my_booking_status():
    """Return whether the resident currently has a live reservation."""
    user = g.current_user
    live = (
        Booking.query
        .filter(
            Booking.resident_id == user.id,
            Booking.status.in_(LIVE_STATUSES),
        )
        .order_by(Booking.created_at.desc())
        .first()
    )
    if live:
        return jsonify({"has_live_booking": True, "booking": live.to_dict()}), 200
    return jsonify({"has_live_booking": False, "booking": None}), 200


# ══════════════════════════════════════════════════════════
# RESIDENT: My bookings
# ══════════════════════════════════════════════════════════

@bookings_bp.get("/bookings/mine")
@require_role("RESIDENT")
def my_bookings():
    user = g.current_user
    bookings = (
        Booking.query
        .filter_by(resident_id=user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )
    return jsonify({"bookings": [b.to_dict() for b in bookings]}), 200


# ══════════════════════════════════════════════════════════
# RESIDENT: Cancel a booking
# ══════════════════════════════════════════════════════════

@bookings_bp.post("/bookings/<int:booking_id>/cancel")
@require_role("RESIDENT")
def cancel_booking(booking_id: int):
    user = g.current_user
    booking = db.session.get(Booking, booking_id)

    if not booking or booking.resident_id != user.id:
        return json_error("Booking not found", 404)
    if booking.status not in ("PENDING", "APPROVED"):
        return json_error("Only pending or approved reservations can be cancelled.", 400)

    booking.status = "CANCELLED"
    try:
        db.session.commit()
        return jsonify({"message": "Reservation cancelled", "booking": booking.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════
# RECEIPT — accessible by resident OR owner
# ══════════════════════════════════════════════════════════

@bookings_bp.get("/bookings/<int:booking_id>/receipt")
@require_auth
def booking_receipt(booking_id: int):
    """Return receipt data for a reservation. Only the booking's resident
    or the listing's owner may access it."""
    user = g.current_user
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return json_error("Reservation not found", 404)

    listing = db.session.get(Listing, booking.listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    # Access guard: resident who owns the booking OR owner of the listing
    is_resident = booking.resident_id == user.id
    is_owner = listing.owner_id == user.id
    if not is_resident and not is_owner:
        return json_error("Forbidden", 403)

    # Only generate receipt for qualifying statuses
    status_val = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_val not in RECEIPT_STATUSES:
        return json_error("Receipt is not available for this reservation status.", 400)

    # ── Build reference number: VHRA-YYYYMMDD-00001 ──
    created = booking.created_at or datetime.now(timezone.utc)
    ref = f"VHRA-{created.strftime('%Y%m%d')}-{booking.id:05d}"

    # ── Resident name ──
    resident = db.session.get(User, booking.resident_id)
    resident_first = (resident.first_name or "").strip() if resident else ""
    resident_last = (resident.last_name or "").strip() if resident else ""
    resident_name = f"{resident_first} {resident_last}".strip() or (resident.email if resident else "—")

    # ── Owner name ──
    owner = db.session.get(User, listing.owner_id)
    owner_first = (owner.first_name or "").strip() if owner else ""
    owner_last = (owner.last_name or "").strip() if owner else ""
    owner_name = f"{owner_first} {owner_last}".strip() or (owner.email if owner else "—")

    # ── Listing details ──
    location = listing.location or {}
    address_parts = [
        location.get("address", ""),
        location.get("barangay", ""),
        location.get("city", ""),
    ]
    full_address = ", ".join(p for p in address_parts if p) or "—"

    capacity = listing.capacity or {}
    monthly_rent = capacity.get("monthly_rent") or capacity.get("price")

    # ── Status display label ──
    STATUS_LABELS = {
        "PENDING": "Pending",
        "APPROVED": "Reserved",
        "ACTIVE": "Occupied",
        "COMPLETED": "Moved Out",
        "REJECTED": "Rejected",
        "CANCELLED": "Cancelled",
    }
    display_status = STATUS_LABELS.get(status_val, status_val)

    return jsonify({
        "receipt": {
            "reference": ref,
            "resident_name": resident_name,
            "listing_title": listing.title or "Untitled listing",
            "listing_address": full_address,
            "owner_name": owner_name,
            "move_in_date": booking.move_in_date.isoformat() if booking.move_in_date else None,
            "monthly_rent": float(monthly_rent) if monthly_rent else None,
            "status": display_status,
            "approved_at": booking.approved_at.isoformat() if booking.approved_at else None,
            "created_at": created.isoformat() if created else None,
        }
    }), 200


# ══════════════════════════════════════════════════════════
# OWNER: Bookings for my listings (calendar-ready)
# ══════════════════════════════════════════════════════════

@bookings_bp.get("/bookings/for-owner")
@require_role("OWNER")
def owner_bookings():
    user = g.current_user
    bookings = (
        Booking.query
        .join(Listing, Booking.listing_id == Listing.id)
        .filter(Listing.owner_id == user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )

    out = []
    for b in bookings:
        d = b.to_dict()
        listing_snap = d.get("listing") or {}

        # Map backend status → calendar display status
        status_map = {
            "APPROVED":  "RESERVED",
            "ACTIVE":    "MOVED_IN",
            "COMPLETED": "MOVE_OUT",
        }
        calendar_status = status_map.get(d.get("status"), d.get("status"))

        out.append({
            **d,
            "calendar_status": calendar_status,
            "unit": listing_snap.get("title") or f"Listing #{b.listing_id}",
            "guest": d.get("resident_name") or "Unknown",
            "start": d.get("move_in_date"),
            "end": d.get("move_out_date"),
            "image": listing_snap.get("cover"),
            "approved_at": d.get("approved_at"),
        })

    return jsonify({"bookings": out}), 200


# ══════════════════════════════════════════════════════════
# OWNER: Update booking status (ACTIVE / COMPLETED)
# ══════════════════════════════════════════════════════════

@bookings_bp.patch("/bookings/<int:booking_id>/status")
@require_role("OWNER")
def update_booking_status(booking_id: int):
    user = g.current_user
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").upper()

    ALLOWED_TRANSITIONS = {
        "PENDING":   ["APPROVED", "REJECTED", "CANCELLED"],
        "APPROVED":  ["ACTIVE",   "CANCELLED"],
        "ACTIVE":    ["COMPLETED","CANCELLED"],
    }

    booking = db.session.get(Booking, booking_id)
    if not booking:
        return json_error("Booking not found", 404)

    listing = db.session.get(Listing, booking.listing_id)
    if not listing or listing.owner_id != user.id:
        return json_error("Forbidden", 403)

    allowed = ALLOWED_TRANSITIONS.get(booking.status, [])
    if new_status not in allowed:
        return json_error(
            f"Cannot transition from {booking.status} to {new_status}.",
            400,
            fields={"status": f"Allowed transitions: {allowed}"}
        )

    # If moving to ACTIVE and no move_in_date set yet, default to today
    if new_status == "ACTIVE" and not booking.move_in_date:
        booking.move_in_date = date.today()

    booking.status = new_status
    if data.get("note"):
        booking.owner_note = (data.get("note") or "").strip() or None

    try:
        db.session.commit()
        return jsonify({"message": f"Booking marked as {new_status}", "booking": booking.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════
#  Approve / Reject booking (with optional note)
# ══════════════════════════════════════════════════════════

@bookings_bp.post("/bookings/<int:booking_id>/approve")
@require_role("OWNER")
def approve_booking(booking_id: int):
    return _owner_update_booking(booking_id, "APPROVED")


@bookings_bp.post("/bookings/<int:booking_id>/reject")
@require_role("OWNER")
def reject_booking(booking_id: int):
    data = request.get_json(silent=True) or {}
    note = (data.get("note") or "").strip() or None
    return _owner_update_booking(booking_id, "REJECTED", note=note)


def _owner_update_booking(booking_id: int, new_status: str, note: str = None):
    user = g.current_user
    booking = db.session.get(Booking, booking_id)

    if not booking:
        return json_error("Booking not found", 404)

    listing = db.session.get(Listing, booking.listing_id)
    if not listing or listing.owner_id != user.id:
        return json_error("Forbidden", 403)

    if booking.status != "PENDING":
        return json_error(f"Only PENDING bookings can be {new_status.lower()}d.", 400)

    booking.status = new_status
    if note:
        booking.owner_note = note

    # Record the exact timestamp when the booking was approved or rejected
    if new_status in ("APPROVED", "REJECTED"):
        booking.approved_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)

    # Notify resident
    resident = booking.resident
    listing_title = listing.title or f"Listing #{booking.listing_id}"

    notif_map = {
        "APPROVED": ("Reservation approved!",  f"Your reservation for '{listing_title}' was approved."),
        "REJECTED": ("Reservation not approved", f"Your reservation for '{listing_title}' was not approved." + (f" Reason: {note}" if note else "")),
    }
    title, body = notif_map[new_status]
    create_notification(user_id=resident.id, notif_type=f"BOOKING_{new_status}", title=title, body=body)

    return jsonify({"message": f"Reservation {new_status.lower()}", "booking": booking.to_dict()}), 200


# ══════════════════════════════════════════════════════════
# OWNER: Verify payment proof
# ══════════════════════════════════════════════════════════

@bookings_bp.patch("/bookings/<int:booking_id>/verify-payment")
@require_role("OWNER")
def verify_payment(booking_id: int):
    """Owner marks the payment proof as verified (or rejects it with a note)."""
    user = g.current_user
    data = request.get_json(silent=True) or {}

    booking = db.session.get(Booking, booking_id)
    if not booking:
        return json_error("Reservation not found.", 404)

    listing = db.session.get(Listing, booking.listing_id)
    if not listing or listing.owner_id != user.id:
        return json_error("Forbidden", 403)

    if not booking.payment_proof_url:
        return json_error("No proof of payment has been uploaded yet.", 400)

    verified = bool(data.get("verified", True))
    note     = (data.get("note") or "").strip() or None

    booking.payment_verified = verified
    if note:
        booking.owner_note = note

    # Auto-advance to ACTIVE when payment verified + currently APPROVED
    if verified and booking.status == "APPROVED":
        booking.status = "ACTIVE"
        if not booking.move_in_date:
            booking.move_in_date = date.today()

    try:
        db.session.commit()
        # Notify resident
        resident = booking.resident
        listing_title = listing.title or f"Listing #{booking.listing_id}"
        if verified:
            create_notification(
                user_id=resident.id,
                notif_type="PAYMENT_VERIFIED",
                title="Payment confirmed!",
                body=f"Your payment for '{listing_title}' has been verified. Welcome!",
            )
        else:
            create_notification(
                user_id=resident.id,
                notif_type="PAYMENT_REJECTED",
                title="Payment not verified",
                body=f"Your payment proof for '{listing_title}' was not accepted." + (f" Reason: {note}" if note else ""),
            )
        return jsonify({"message": "Payment status updated.", "booking": booking.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)