from flask import Blueprint, jsonify, request, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models.saved_listing import SavedListing
from ..models.listing import Listing
from ..auth.jwt import require_auth
from ..utils.errors import json_error

saved_bp = Blueprint("saved", __name__)


@saved_bp.post("/listings/<int:listing_id>/save")
@require_auth
def toggle_save(listing_id):
    """Toggle save/unsave a listing. Returns { saved: true/false }."""
    user = g.current_user

    listing = db.session.get(Listing, listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    existing = SavedListing.query.filter_by(
        user_id=user.id, listing_id=listing_id
    ).first()

    try:
        if existing:
            db.session.delete(existing)
            db.session.commit()
            return jsonify({"saved": False, "listing_id": listing_id}), 200
        else:
            save = SavedListing(user_id=user.id, listing_id=listing_id)
            db.session.add(save)
            db.session.commit()
            return jsonify({"saved": True, "listing_id": listing_id}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


@saved_bp.get("/listings/saved")
@require_auth
def list_saved():
    """Get current user's saved listings with full listing data."""
    user = g.current_user

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 100)

    query = (
        db.session.query(SavedListing, Listing)
        .join(Listing, SavedListing.listing_id == Listing.id)
        .filter(SavedListing.user_id == user.id)
        .filter(Listing.status == "PUBLISHED")
        .order_by(SavedListing.saved_at.desc())
    )

    total = query.count()
    results = query.offset((page - 1) * per_page).limit(per_page).all()

    listings = []
    for saved, listing in results:
        data = listing.to_dict()
        data["saved_at"] = saved.saved_at.isoformat() if saved.saved_at else None
        listings.append(data)

    return jsonify({
        "listings": listings,
        "total": total,
        "page": page,
        "per_page": per_page,
    }), 200


@saved_bp.get("/listings/saved/ids")
@require_auth
def saved_ids():
    """Return just the IDs of saved listings — used for heart button state on browse."""
    user = g.current_user
    rows = SavedListing.query.filter_by(user_id=user.id).all()
    return jsonify({"ids": [r.listing_id for r in rows]}), 200