# app/routes/listings.py
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional

from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import Listing
from ..auth.jwt import require_role
from ..utils.errors import json_error

listings_bp = Blueprint("listings", __name__)

# =========================
# NCR barangay dataset loader
# =========================
NCR_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ncr_barangays.json")
_NCR_CACHE: Optional[Dict[str, list]] = None


def _load_ncr_barangays() -> Dict[str, list]:
    global _NCR_CACHE
    if _NCR_CACHE is not None:
        return _NCR_CACHE

    if not os.path.exists(NCR_DATA_PATH):
        _NCR_CACHE = {}
        return _NCR_CACHE

    with open(NCR_DATA_PATH, "r", encoding="utf-8") as f:
        _NCR_CACHE = json.load(f) or {}
    return _NCR_CACHE


def _norm(s: Any) -> str:
    return str(s or "").strip().lower()


# =========================
# Helpers
# =========================
def _get_owned_listing_or_404(listing_id: int) -> Optional[Listing]:
    user = g.current_user
    listing = Listing.query.get(listing_id)
    if not listing or listing.owner_id != user.id:
        return None
    return listing


def _commit_or_500(payload: dict, status_code: int = 200):
    try:
        db.session.commit()
        return jsonify(payload), status_code
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# =========================
# Read / Resume endpoints
# =========================
@listings_bp.get("/listings/<int:listing_id>")
@require_role("OWNER")
def get_listing(listing_id: int):
    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)
    return jsonify({"listing": listing.to_dict()}), 200


@listings_bp.get("/listings/drafts/latest")
@require_role("OWNER")
def get_latest_draft():
    user = g.current_user

    # NOTE: requires Listing.updated_at for best results.
    # If you don't have it, change to: .order_by(Listing.id.desc())
    listing = (
        Listing.query
        .filter_by(owner_id=user.id, status="DRAFT")
        .order_by(Listing.updated_at.desc())
        .first()
    )

    return jsonify({"listing": listing.to_dict() if listing else None}), 200


# =========================
# Step 1 (Create draft)
# =========================
@listings_bp.post("/listings/step-1")
@require_role("OWNER")
def create_step1():
    user = g.current_user
    data = request.get_json(silent=True) or {}

    place_type = data.get("placeType") or data.get("place_type")
    if place_type is not None and (not isinstance(place_type, str) or not place_type.strip()):
        return json_error("Validation failed", 400, fields={"placeType": "Must be a non-empty string."})

    listing = Listing(
        owner_id=user.id,
        status="DRAFT",
        current_step=1,
        place_type=place_type.strip() if isinstance(place_type, str) else None,
    )

    try:
        db.session.add(listing)
        db.session.commit()
        return jsonify({"message": "Draft listing created", "listing": listing.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# =========================
# Step 2 (space type)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-2")
@require_role("OWNER")
def update_step2(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    space_type = data.get("spaceType") or data.get("space_type")
    if not space_type or not isinstance(space_type, str) or not space_type.strip():
        return json_error("Validation failed", 400, fields={"spaceType": "Must be a non-empty string."})

    listing.space_type = space_type.strip()
    listing.current_step = max(listing.current_step or 1, 2)

    return _commit_or_500({"message": "Step 2 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 3 (location) - NCR validation + ZIP 4 digits
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-3")
@require_role("OWNER")
def update_step3(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    street = data.get("street")
    city = data.get("city")
    barangay = data.get("barangay") or ""
    zip_raw = data.get("zip")

    zip_code = str(zip_raw).strip() if zip_raw is not None else ""
    province = "Metro Manila"  # force always

    fields: Dict[str, str] = {}

    if not isinstance(street, str) or not street.strip():
        fields["street"] = "Street is required."
    if not isinstance(city, str) or not city.strip():
        fields["city"] = "City is required."
    if not zip_code:
        fields["zip"] = "ZIP is required."
    elif not re.fullmatch(r"^\d{4}$", zip_code):
        fields["zip"] = "ZIP must be a 4-digit code."

    ncr = _load_ncr_barangays()

    # city must exist in NCR dataset
    if isinstance(city, str) and city.strip():
        if city not in ncr:
            fields["city"] = f"Unknown city '{city}'."

        # barangay optional but if provided must match city list
        if barangay and city in ncr:
            allowed = ncr.get(city) or []
            allowed_norm = { _norm(b) for b in allowed }
            if _norm(barangay) not in allowed_norm:
                fields["barangay"] = f"Unknown barangay '{barangay}' for {city}."

    if fields:
        return json_error("Validation failed", 400, fields=fields)

    # store as JSON (keep FE payload), but enforce province + normalized zip
    listing.location = {
        **data,
        "province": province,
        "zip": zip_code,
    }
    listing.current_step = max(listing.current_step or 1, 3)

    return _commit_or_500({"message": "Step 3 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 4 (capacity JSON)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-4")
@require_role("OWNER")
def update_step4(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    cap = data.get("capacity")
    if not isinstance(cap, dict):
        return json_error("Validation failed", 400, fields={"capacity": "Must be an object."})

    try:
        guests = int(cap.get("guests"))
    except Exception:
        guests = 0

    if guests < 1:
        return json_error("Validation failed", 400, fields={"capacity.guests": "Must be at least 1."})

    listing.capacity = cap
    listing.current_step = max(listing.current_step or 1, 4)

    return _commit_or_500({"message": "Step 4 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 5 (amenities JSON)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-5")
@require_role("OWNER")
def update_step5(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    amenities = data.get("amenities")
    if not isinstance(amenities, dict):
        return json_error("Validation failed", 400, fields={"amenities": "Must be an object."})

    appliances = amenities.get("appliances") or []
    activities = amenities.get("activities") or []
    safety = amenities.get("safety") or []

    if not (isinstance(appliances, list) and isinstance(activities, list) and isinstance(safety, list)):
        return json_error("Validation failed", 400, fields={"amenities": "Each group must be an array."})

    total = len(appliances) + len(activities) + len(safety)
    if total < 1:
        return json_error("Validation failed", 400, fields={"amenities": "Select at least 1 amenity."})

    listing.amenities = {"appliances": appliances, "activities": activities, "safety": safety}
    listing.current_step = max(listing.current_step or 1, 5)

    return _commit_or_500({"message": "Step 5 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 6 (highlights array)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-6")
@require_role("OWNER")
def update_step6(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    highlights = data.get("highlights")
    if not isinstance(highlights, list):
        return json_error("Validation failed", 400, fields={"highlights": "Must be an array."})

    if len(highlights) < 1:
        return json_error("Validation failed", 400, fields={"highlights": "Select at least 1 highlight."})
    if len(highlights) > 5:
        return json_error("Validation failed", 400, fields={"highlights": "Max is 5."})

    listing.highlights = highlights
    listing.current_step = max(listing.current_step or 1, 6)

    return _commit_or_500({"message": "Step 6 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 7 (photos)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-7")
@require_role("OWNER")
def update_step7(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    photos = data.get("photos")
    if not isinstance(photos, list):
        return json_error("Validation failed", 400, fields={"photos": "Must be an array."})

    if len(photos) < 5:
        return json_error("Validation failed", 400, fields={"photos": "Minimum 5 photos required."})

    listing.photos = photos
    listing.current_step = max(listing.current_step or 1, 7)

    return _commit_or_500({"message": "Step 7 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 8 (title + description)
# =========================
@listings_bp.patch("/listings/<int:listing_id>/step-8")
@require_role("OWNER")
def update_step8(listing_id: int):
    data = request.get_json(silent=True) or {}

    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    title = data.get("title")
    description = data.get("description")

    if not isinstance(title, str) or len(title.strip()) < 3:
        return json_error("Validation failed", 400, fields={"title": "Title must be at least 3 characters."})
    if not isinstance(description, str) or len(description.strip()) < 10:
        return json_error("Validation failed", 400, fields={"description": "Description must be at least 10 characters."})

    listing.title = title.strip()
    listing.description = description.strip()
    listing.current_step = max(listing.current_step or 1, 8)

    return _commit_or_500({"message": "Step 8 saved", "listing": listing.to_dict()}, 200)


# =========================
# Submit for verification
# =========================
@listings_bp.post("/listings/<int:listing_id>/submit-for-verification")
@require_role("OWNER")
def submit_for_verification(listing_id: int):
    user = g.current_user
    listing = Listing.query.get(listing_id)

    if not listing:
        return json_error("Listing not found", 404)
    if listing.owner_id != user.id:
        return json_error("Forbidden", 403)

    listing.status = "PENDING_VERIFICATION" if not user.is_verified else "DRAFT"
    return _commit_or_500(
        {"message": "Submitted", "listing": listing.to_dict(), "owner_verified": bool(user.is_verified)},
        200
    )

@listings_bp.get("/listings/feed")
def resident_feed():
    city = (request.args.get("city") or "").strip().lower()
    limit = request.args.get("limit", 30, type=int)
    limit = max(1, min(limit, 60))  # clamp 1..60

    # Only show published listings to residents
    listings = (
        Listing.query
        .filter(Listing.status == "PUBLISHED")
        .order_by(Listing.updated_at.desc())
        .limit(60)  # fetch more then python-filter by city
        .all()
    )

    out = []
    for l in listings:
        d = l.to_dict()

        # Optional: filter by city (works across SQLite/MySQL/Postgres safely)
        if city:
            loc_city = ((d.get("location") or {}).get("city") or "").strip().lower()
            if city not in loc_city:
                continue

        # Build light "card" fields (optional but nice)
        photos = d.get("photos") or []
        cover = photos[0] if isinstance(photos, list) and photos else None

        out.append({
            "id": d["id"],
            "title": d.get("title") or "Untitled space",
            "city": (d.get("location") or {}).get("city") or "",
            "barangay": (d.get("location") or {}).get("barangay") or "",
            "price": (d.get("capacity") or {}).get("price") if isinstance(d.get("capacity"), dict) else None,
            "cover": cover,
            "status": d.get("status"),
        })

        if len(out) >= limit:
            break

    return jsonify({"listings": out}), 200

