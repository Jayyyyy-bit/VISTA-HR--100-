"""
app/routes/reviews.py
---------------------
GET    /listings/<id>/reviews        — public listing reviews (LISTING type)
POST   /listings/<id>/reviews        — resident submits LISTING review (COMPLETED booking)
PATCH  /listings/<id>/reviews/mine   — resident edits own LISTING review
DELETE /listings/<id>/reviews/mine   — resident deletes own LISTING review
GET    /listings/<id>/public         — public listing detail

POST   /reviews/submit               — submit any review type (OWNER, RESIDENT, SYSTEM)
GET    /reviews/user/<id>            — get reviews targeting a user (public)
GET    /reviews/system               — get system reviews (admin)
GET    /reviews/eligibility/<bid>    — check which reviews are pending for a booking
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func

from ..extensions import db
from ..models import Listing, Booking
from ..models.review import Review
from ..models.user import User
from ..auth.jwt import require_auth, require_role
from ..utils.errors import json_error

reviews_bp = Blueprint("reviews", __name__)

VALID_TYPES = {"LISTING", "OWNER", "RESIDENT", "SYSTEM"}


# ══════════════════════════════════════════════════════════════
# PUBLIC — Single listing detail
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/listings/<int:listing_id>/public")
def listing_public(listing_id: int):
    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    owner = db.session.get(User, listing.owner_id)
    owner_info = None
    if owner:
        first = (owner.first_name or "").strip()
        last  = (owner.last_name  or "").strip()
        owner_rating_row = (
            db.session.query(func.count(Review.id), func.avg(Review.rating))
            .filter(Review.target_user_id == owner.id, Review.review_type == "OWNER")
            .one()
        )
        owner_info = {
            "id":             owner.id,
            "name":           f"{first} {last}".strip() or "Property Owner",
            "member_since":   owner.created_at.year if owner.created_at else None,
            "email":          owner.email if bool(getattr(owner, "email_verified", False)) else None,
            "avatar_url":     getattr(owner, "avatar_url", None),
            "kyc_verified":   getattr(owner, "kyc_status", None) == "APPROVED",
            "owner_rating":   round(float(owner_rating_row[1]), 1) if owner_rating_row[1] else None,
            "owner_reviews":  owner_rating_row[0] or 0,
        }

    stats = (
        db.session.query(func.count(Review.id), func.avg(Review.rating))
        .filter(Review.listing_id == listing_id, Review.review_type == "LISTING")
        .one()
    )
    total      = stats[0] or 0
    avg_rating = round(float(stats[1]), 1) if stats[1] else None

    d = listing.to_dict()
    return jsonify({
        "listing": {
            **d,
            "owner":        owner_info,
            "review_count": total,
            "avg_rating":   avg_rating,
        }
    }), 200


# ══════════════════════════════════════════════════════════════
# PUBLIC — Listing reviews list
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/listings/<int:listing_id>/reviews")
def list_reviews(listing_id: int):
    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    page     = request.args.get("page",     1,  type=int)
    per_page = request.args.get("per_page", 10, type=int)
    per_page = min(per_page, 50)

    base_query = Review.query.filter_by(listing_id=listing_id, review_type="LISTING")
    total      = base_query.count()
    reviews    = (
        base_query
        .order_by(Review.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    rating_rows = (
        db.session.query(Review.rating, func.count(Review.id))
        .filter(Review.listing_id == listing_id, Review.review_type == "LISTING")
        .group_by(Review.rating)
        .all()
    )
    breakdown  = {str(i): 0 for i in range(1, 6)}
    total_sum  = 0
    total_cnt  = 0
    for rating, cnt in rating_rows:
        breakdown[str(rating)] = cnt
        total_sum += rating * cnt
        total_cnt += cnt
    avg = round(total_sum / total_cnt, 1) if total_cnt else None

    # Batch-load reviewer avatars — avoids N+1
    reviewer_ids = [r.reviewer_id for r in reviews]
    avatar_map = {}
    if reviewer_ids:
        rows = db.session.query(User.id, User.avatar_url).filter(User.id.in_(reviewer_ids)).all()
        avatar_map = {row.id: row.avatar_url for row in rows}

    def _serialize(r):
        d = r.to_dict()
        d["reviewer_avatar_url"] = avatar_map.get(r.reviewer_id)
        return d

    return jsonify({
        "reviews":          [_serialize(r) for r in reviews],
        "total":            total,
        "page":             page,
        "per_page":         per_page,
        "avg_rating":       avg,
        "rating_breakdown": breakdown,
    }), 200


# ══════════════════════════════════════════════════════════════
# RESIDENT — Submit LISTING review (legacy endpoint, unchanged UX)
# ══════════════════════════════════════════════════════════════

@reviews_bp.post("/listings/<int:listing_id>/reviews")
@require_role("RESIDENT")
def create_listing_review(listing_id: int):
    user = g.current_user
    data = request.get_json(silent=True) or {}

    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    eligible_booking = Booking.query.filter(
        Booking.listing_id  == listing_id,
        Booking.resident_id == user.id,
        Booking.status.in_(("COMPLETED", "MOVED_OUT")),
    ).first()
    if not eligible_booking:
        return json_error("You can only review a listing after your booking is completed.", 403,
                          code="NOT_ELIGIBLE")

    existing = Review.query.filter_by(
        reviewer_id=user.id, listing_id=listing_id, review_type="LISTING"
    ).first()
    if existing:
        return json_error("You have already reviewed this listing.", 409)

    try:
        rating = int(data.get("rating", 0))
        if not (1 <= rating <= 5):
            raise ValueError
    except (TypeError, ValueError):
        return json_error("Validation failed", 400, fields={"rating": "Rating must be 1–5."})

    comment = (data.get("comment") or "").strip() or None
    if comment and len(comment) > 1000:
        return json_error("Validation failed", 400, fields={"comment": "Max 1000 characters."})

    review = Review(
        reviewer_id   = user.id,
        reviewer_role = "RESIDENT",
        review_type   = "LISTING",
        listing_id    = listing_id,
        booking_id    = eligible_booking.id,
        rating        = rating,
        comment       = comment,
    )

    try:
        db.session.add(review)
        db.session.commit()
        return jsonify({"message": "Review submitted", "review": review.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════════
# RESIDENT — Edit own LISTING review
# ══════════════════════════════════════════════════════════════

@reviews_bp.patch("/listings/<int:listing_id>/reviews/mine")
@require_role("RESIDENT")
def update_review(listing_id: int):
    user = g.current_user
    data = request.get_json(silent=True) or {}

    review = Review.query.filter_by(
        reviewer_id=user.id, listing_id=listing_id, review_type="LISTING"
    ).first()
    if not review:
        return json_error("Review not found", 404)

    if "rating" in data:
        try:
            rating = int(data["rating"])
            if not (1 <= rating <= 5):
                raise ValueError
            review.rating = rating
        except (TypeError, ValueError):
            return json_error("Validation failed", 400, fields={"rating": "Rating must be 1–5."})

    if "comment" in data:
        comment = (data["comment"] or "").strip() or None
        if comment and len(comment) > 1000:
            return json_error("Validation failed", 400, fields={"comment": "Max 1000 characters."})
        review.comment = comment

    try:
        db.session.commit()
        return jsonify({"message": "Review updated", "review": review.to_dict()}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════════
# RESIDENT — Delete own LISTING review
# ══════════════════════════════════════════════════════════════

@reviews_bp.delete("/listings/<int:listing_id>/reviews/mine")
@require_role("RESIDENT")
def delete_review(listing_id: int):
    user = g.current_user
    review = Review.query.filter_by(
        reviewer_id=user.id, listing_id=listing_id, review_type="LISTING"
    ).first()
    if not review:
        return json_error("Review not found", 404)

    try:
        db.session.delete(review)
        db.session.commit()
        return jsonify({"message": "Review deleted"}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════════
# ANY AUTH — Submit OWNER / RESIDENT / SYSTEM review
# ══════════════════════════════════════════════════════════════

@reviews_bp.post("/reviews/submit")
@require_auth
def submit_review():
    """
    Accepts OWNER, RESIDENT, SYSTEM review types.

    Body:
      booking_id   int       required for OWNER/RESIDENT/SYSTEM
      review_type  str       OWNER | RESIDENT | SYSTEM
      rating       int       1-5
      comment      str       optional, max 1000 chars
    """
    user = g.current_user
    data = request.get_json(silent=True) or {}

    review_type = (data.get("review_type") or "").upper()
    if review_type not in {"OWNER", "RESIDENT", "SYSTEM"}:
        return json_error("Invalid review_type. Must be OWNER, RESIDENT, or SYSTEM.", 400)

    booking_id = data.get("booking_id")
    if not booking_id:
        return json_error("booking_id is required.", 400)

    booking = db.session.get(Booking, booking_id)
    if not booking:
        return json_error("Booking not found.", 404)

    # Authorization: reviewer must be one of the parties
    user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    is_resident = user_role == "RESIDENT" and booking.resident_id == user.id
    is_owner    = user_role == "OWNER"    and booking.listing.owner_id == user.id

    if not (is_resident or is_owner):
        return json_error("Forbidden.", 403)

    # Business rules per type
    if review_type == "OWNER":
        # Resident rates owner — booking must be ACTIVE, COMPLETED, CANCELLED, or MOVED_OUT
        if not is_resident:
            return json_error("Only residents can rate property owners.", 403)
        if booking.status not in ("ACTIVE", "COMPLETED", "CANCELLED", "MOVED_OUT"):
            return json_error("You can rate the owner once your booking is active.", 403)

    elif review_type == "RESIDENT":
        # Owner rates resident — booking must be COMPLETED or CANCELLED (moved out)
        if not is_owner:
            return json_error("Only owners can rate residents.", 403)
        if booking.status not in ("COMPLETED", "CANCELLED"):
            return json_error("You can rate the resident after they have moved out.", 403)

    elif review_type == "SYSTEM":
        if booking.status not in ("ACTIVE", "COMPLETED", "CANCELLED", "MOVED_OUT"):
            return json_error("System rating is available once a booking is active.", 403)

    # Dedup check
    existing = Review.query.filter_by(
        reviewer_id=user.id, booking_id=booking_id, review_type=review_type
    ).first()
    if existing:
        return json_error("You have already submitted this review.", 409)

    # Validate rating
    try:
        rating = int(data.get("rating", 0))
        if not (1 <= rating <= 5):
            raise ValueError
    except (TypeError, ValueError):
        return json_error("Validation failed", 400, fields={"rating": "Rating must be 1–5."})

    comment = (data.get("comment") or "").strip() or None
    if comment and len(comment) > 1000:
        return json_error("Validation failed", 400, fields={"comment": "Max 1000 characters."})

    # Resolve target
    target_user_id = None
    listing_id     = booking.listing_id

    if review_type == "OWNER":
        target_user_id = booking.listing.owner_id
    elif review_type == "RESIDENT":
        target_user_id = booking.resident_id
    # SYSTEM: no target_user_id, no listing_id needed

    review = Review(
        reviewer_id   = user.id,
        reviewer_role = user_role,
        review_type   = review_type,
        listing_id    = listing_id if review_type != "SYSTEM" else None,
        target_user_id= target_user_id,
        booking_id    = booking_id,
        rating        = rating,
        comment       = comment,
    )

    try:
        db.session.add(review)
        db.session.commit()
        return jsonify({"message": "Review submitted", "review": review.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════════
# PUBLIC — Reviews targeting a user (owner profile / resident profile)
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/reviews/user/<int:user_id>")
def get_user_reviews(user_id: int):
    review_type = request.args.get("type", "OWNER").upper()
    if review_type not in {"OWNER", "RESIDENT"}:
        return json_error("type must be OWNER or RESIDENT", 400)

    page     = request.args.get("page",     1,  type=int)
    per_page = request.args.get("per_page", 10, type=int)
    per_page = min(per_page, 50)

    base = Review.query.filter_by(target_user_id=user_id, review_type=review_type)
    total   = base.count()
    reviews = (
        base.order_by(Review.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    stats = (
        db.session.query(func.avg(Review.rating))
        .filter_by(target_user_id=user_id, review_type=review_type)
        .scalar()
    )
    avg = round(float(stats), 1) if stats else None

    return jsonify({
        "reviews":    [r.to_dict() for r in reviews],
        "total":      total,
        "avg_rating": avg,
        "page":       page,
        "per_page":   per_page,
    }), 200


# ══════════════════════════════════════════════════════════════
# AUTH — Check which reviews are still pending for a booking
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/reviews/eligibility/<int:booking_id>")
@require_auth
def review_eligibility(booking_id: int):
    """
    Returns which review types the current user can still submit for this booking.
    Frontend uses this to decide which modals to show.
    """
    user = g.current_user
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return json_error("Booking not found.", 404)

    user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    is_resident = user_role == "RESIDENT" and booking.resident_id == user.id
    is_owner    = user_role == "OWNER"    and booking.listing.owner_id == user.id

    if not (is_resident or is_owner):
        return json_error("Forbidden.", 403)

    status = booking.status

    # Already submitted reviews for this booking
    done = {
        r.review_type
        for r in Review.query.filter_by(reviewer_id=user.id, booking_id=booking_id).all()
    }

    pending = []

    if is_resident:
        if status in ("ACTIVE", "COMPLETED", "CANCELLED", "MOVED_OUT") and "OWNER" not in done:
            pending.append("OWNER")
        if status in ("ACTIVE", "COMPLETED", "CANCELLED", "MOVED_OUT") and "SYSTEM" not in done:
            pending.append("SYSTEM")
        if status in ("COMPLETED", "MOVED_OUT") and "LISTING" not in done:
            pending.append("LISTING")

    if is_owner:
        if status in ("ACTIVE",) and "SYSTEM" not in done:
            pending.append("SYSTEM")
        if status in ("COMPLETED", "CANCELLED") and "RESIDENT" not in done:
            pending.append("RESIDENT")

    return jsonify({
        "booking_id": booking_id,
        "status":     status,
        "pending":    pending,
        "done":       list(done),
    }), 200