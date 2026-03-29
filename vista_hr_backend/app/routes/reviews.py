"""
app/routes/reviews.py
---------------------
GET  /listings/<id>/reviews          — public, paginated reviews for a listing
POST /listings/<id>/reviews          — resident submits a review (requires ACTIVE/COMPLETED booking)
GET  /listings/<id>/public           — public single listing detail (no auth required)
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import Listing, Booking
from ..models.review import Review
from ..models.user import User
from ..auth.jwt import require_role, require_auth
from ..utils.errors import json_error

reviews_bp = Blueprint("reviews", __name__)

ALLOWED_ORIGINS = {"http://127.0.0.1:5500", "http://localhost:5500"}

@reviews_bp.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response

@reviews_bp.route("/listings/<path:path>", methods=["OPTIONS"])
@reviews_bp.route("/listings/<int:listing_id>/reviews", methods=["OPTIONS"])
def handle_options(**kwargs):
    from flask import make_response
    resp = make_response("", 204)
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return resp


# ══════════════════════════════════════════════════════════════
# PUBLIC — Single listing detail (no auth needed)
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/listings/<int:listing_id>/public")
def listing_public(listing_id: int):
    """Full listing detail for the resident detail page. No auth required."""
    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    owner = db.session.get(User, listing.owner_id)
    owner_info = None
    if owner:
        first = (owner.first_name or "").strip()
        last = (owner.last_name or "").strip()
        owner_info = {
            "id": owner.id,
            "name": f"{first} {last}".strip() or "Property Owner",
            "member_since": owner.created_at.year if owner.created_at else None,
            "email": owner.email if bool(owner.email_verified) else None,
        }

    # Aggregate review stats
    all_reviews = Review.query.filter_by(listing_id=listing_id).all()
    total = len(all_reviews)
    avg_rating = round(sum(r.rating for r in all_reviews) / total, 1) if total else None

    d = listing.to_dict()
    return jsonify({
        "listing": {
            **d,
            "owner": owner_info,
            "review_count": total,
            "avg_rating": avg_rating,
        }
    }), 200


# ══════════════════════════════════════════════════════════════
# PUBLIC — Reviews list for a listing
# ══════════════════════════════════════════════════════════════

@reviews_bp.get("/listings/<int:listing_id>/reviews")
def list_reviews(listing_id: int):
    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 10, type=int), 50)

    query = (
        Review.query
        .filter_by(listing_id=listing_id)
        .order_by(Review.created_at.desc())
    )
    total = query.count()
    reviews = query.offset((page - 1) * per_page).limit(per_page).all()

    # Rating breakdown (1–5 counts)
    all_ratings = [r.rating for r in Review.query.filter_by(listing_id=listing_id).all()]
    breakdown = {str(i): all_ratings.count(i) for i in range(1, 6)}
    avg = round(sum(all_ratings) / len(all_ratings), 1) if all_ratings else None

    return jsonify({
        "reviews": [r.to_dict() for r in reviews],
        "total": total,
        "page": page,
        "per_page": per_page,
        "avg_rating": avg,
        "rating_breakdown": breakdown,
    }), 200


# ══════════════════════════════════════════════════════════════
# RESIDENT — Submit a review
# ══════════════════════════════════════════════════════════════

@reviews_bp.post("/listings/<int:listing_id>/reviews")
@require_role("RESIDENT")
def create_review(listing_id: int):
    user = g.current_user
    data = request.get_json(silent=True) or {}

    listing = db.session.get(Listing, listing_id)
    if not listing or listing.status != "PUBLISHED":
        return json_error("Listing not found", 404)

    # Must have a completed or active booking to review
    eligible_booking = Booking.query.filter(
        Booking.listing_id == listing_id,
        Booking.resident_id == user.id,
        Booking.status.in_(["ACTIVE", "COMPLETED"]),
    ).first()
    if not eligible_booking:
        return json_error(
            "You can only review a listing after your booking is active or completed.",
            403,
            code="NOT_ELIGIBLE",
        )

    # Check for existing review
    existing = Review.query.filter_by(
        listing_id=listing_id, resident_id=user.id
    ).first()
    if existing:
        return json_error("You have already reviewed this listing.", 409)

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

    review = Review(
        listing_id=listing_id,
        resident_id=user.id,
        rating=rating,
        comment=comment,
    )

    try:
        db.session.add(review)
        db.session.commit()
        return jsonify({"message": "Review submitted", "review": review.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════════════════════
# RESIDENT — Update own review
# ══════════════════════════════════════════════════════════════

@reviews_bp.patch("/listings/<int:listing_id>/reviews/mine")
@require_role("RESIDENT")
def update_review(listing_id: int):
    user = g.current_user
    data = request.get_json(silent=True) or {}

    review = Review.query.filter_by(
        listing_id=listing_id, resident_id=user.id
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
# RESIDENT — Delete own review
# ══════════════════════════════════════════════════════════════

@reviews_bp.delete("/listings/<int:listing_id>/reviews/mine")
@require_role("RESIDENT")
def delete_review(listing_id: int):
    user = g.current_user
    review = Review.query.filter_by(
        listing_id=listing_id, resident_id=user.id
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