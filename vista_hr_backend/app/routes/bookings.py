from __future__ import annotations

from datetime import date

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import Listing, Booking
from ..auth.jwt import require_role
from ..utils.errors import json_error

bookings_bp = Blueprint("bookings", __name__)


# ══════════════════════════════════════════════
# RESIDENT: Request a booking
# ══════════════════════════════════════════════
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
    message = (data.get("message") or "").strip() or None

    # ── Validate listing_id ──
    if not listing_id or not isinstance(listing_id, int):
        return json_error("Validation failed", 400, fields={"listing_id": "Required integer."})

    listing = Listing.query.get(listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found or unavailable", 404)

    # ── Validate move_in_date (optional but if provided must be valid) ──
    move_in = None
    if move_in_raw:
        try:
            move_in = date.fromisoformat(str(move_in_raw))
            if move_in < date.today():
                return json_error("Validation failed", 400, fields={"move_in_date": "Move-in date cannot be in the past."})
        except ValueError:
            return json_error("Validation failed", 400, fields={"move_in_date": "Must be a valid date (YYYY-MM-DD)."})

    # ── Prevent duplicate PENDING booking for same listing ──
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
        message=message,
    )

    try:
        db.session.add(booking)
        db.session.commit()
        return jsonify({"message": "Booking request submitted", "booking": booking.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════
# RESIDENT: My bookings
# ══════════════════════════════════════════════
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


# ══════════════════════════════════════════════
# RESIDENT: Cancel a booking
# ══════════════════════════════════════════════
@bookings_bp.post("/bookings/<int:booking_id>/cancel")
@require_role("RESIDENT")
def cancel_booking(booking_id: int):
    user = g.current_user
    booking = Booking.query.get(booking_id)

    if not booking or booking.resident_id != user.id:
        return json_error("Booking not found", 404)
    if booking.status not in ("PENDING",):
        return json_error("Only pending bookings can be cancelled.", 400)

    booking.status = "CANCELLED"
    try:
        db.session.commit()
        return jsonify({"message": "Booking cancelled", "booking": booking.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════
# OWNER: Bookings for my listings
# ══════════════════════════════════════════════
@bookings_bp.get("/bookings/for-owner")
@require_role("OWNER")
def owner_bookings():
    user = g.current_user
    # Only bookings for listings owned by this user
    bookings = (
        Booking.query
        .join(Listing, Booking.listing_id == Listing.id)
        .filter(Listing.owner_id == user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )
    return jsonify({"bookings": [b.to_dict() for b in bookings]}), 200


# ══════════════════════════════════════════════
# OWNER: Approve a booking
# ══════════════════════════════════════════════
@bookings_bp.post("/bookings/<int:booking_id>/approve")
@require_role("OWNER")
def approve_booking(booking_id: int):
    return _owner_update_booking(booking_id, "APPROVED")


# ══════════════════════════════════════════════
# OWNER: Reject a booking
# ══════════════════════════════════════════════
@bookings_bp.post("/bookings/<int:booking_id>/reject")
@require_role("OWNER")
def reject_booking(booking_id: int):
    data = request.get_json(silent=True) or {}
    note = (data.get("note") or "").strip() or None
    return _owner_update_booking(booking_id, "REJECTED", note=note)


def _owner_update_booking(booking_id: int, new_status: str, note: str = None):
    user = g.current_user
    booking = Booking.query.get(booking_id)

    if not booking:
        return json_error("Booking not found", 404)

    listing = Listing.query.get(booking.listing_id)
    if not listing or listing.owner_id != user.id:
        return json_error("Forbidden", 403)

    if booking.status != "PENDING":
        return json_error(f"Only PENDING bookings can be {new_status.lower()}d.", 400)

    booking.status = new_status
    if note:
        booking.owner_note = note

    try:
        db.session.commit()
        return jsonify({"message": f"Booking {new_status.lower()}", "booking": booking.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)