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


def _owner_listing_limit(user) -> int:
    # ✅ your rule:
    # unverified owners: 3 drafts/ready max
    # verified owners: 10 drafts/ready max
    return 10 if bool(getattr(user, "is_verified", False)) else 3


def _active_owner_listings_count(user) -> int:
    # counts "in progress" + "ready" (not published/archived)
    return (
        Listing.query
        .filter(
            Listing.owner_id == user.id,
            Listing.status.in_(["DRAFT", "READY"])
        )
        .count()
    )


def _is_listing_complete(listing: Listing) -> bool:
    # minimal completion rule (matches your step requirements)
    # NOTE: backend is truth; you can extend later.
    if not listing.place_type:
        return False
    if not listing.space_type:
        return False

    loc = listing.location or {}
    if not (loc.get("street") and loc.get("city") and loc.get("zip")):
        return False

    cap = listing.capacity or {}
    try:
        guests = int(cap.get("guests", 0))
    except Exception:
        guests = 0
    if guests < 1:
        return False

    amenities = listing.amenities or {}
    a = amenities.get("appliances") or []
    b = amenities.get("activities") or []
    c = amenities.get("safety") or []
    if (len(a) + len(b) + len(c)) < 1:
        return False

    highlights = listing.highlights or []
    if len(highlights) < 1:
        return False

    photos = listing.photos or []
    if not isinstance(photos, list) or len(photos) < 5:
        return False

    if not listing.title or len(listing.title.strip()) < 3:
        return False
    if not listing.description or len(listing.description.strip()) < 10:
        return False

    return True


# =========================
# OWNER: Dashboard list
# =========================
@listings_bp.get("/listings/mine")
@require_role("OWNER")
def my_listings():
    user = g.current_user

    listings = (
        Listing.query
        .filter(Listing.owner_id == user.id)
        .order_by(Listing.updated_at.desc())
        .all()
    )

    out = []
    for l in listings:
        d = l.to_dict()

        # cover extraction
        photos = d.get("photos") or []
        cover = None
        if isinstance(photos, list) and photos:
            # if photos are objects, pick isCover first
            if isinstance(photos[0], dict):
                cover_obj = next((p for p in photos if isinstance(p, dict) and p.get("isCover")), None)
                cover = (cover_obj or photos[0]).get("url") if isinstance((cover_obj or photos[0]), dict) else None
            else:
                # if photos are strings
                cover = photos[0]

        # compute "badge" state
        status = d.get("status") or "DRAFT"
        complete = _is_listing_complete(l)
        # if complete but status still DRAFT, front can show "In progress" but backend will fix on step-8 anyway

        out.append({
            "id": d.get("id"),
            "status": status,
            "current_step": d.get("current_step") or 1,
            "updated_at": d.get("updated_at"),
            "created_at": d.get("created_at"),
            "title": d.get("title") or "",
            "city": (d.get("location") or {}).get("city") or "",
            "barangay": (d.get("location") or {}).get("barangay") or "",
            "cover": cover,              #  dashboard image
            "complete": bool(complete),  #  for "Ready to publish" UI
            "photos": photos,
        })

    return jsonify({
        "listings": out,
        "limit": _owner_listing_limit(user),
        "active_count": _active_owner_listings_count(user),
        "owner_verified": bool(getattr(user, "is_verified", False)),
    }), 200


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
    listing = (
        Listing.query
        .filter(
            Listing.owner_id == user.id,
            Listing.status.in_(["DRAFT", "READY"])
        )
        .order_by(Listing.updated_at.desc())
        .first()
    )
    return jsonify({"listing": listing.to_dict() if listing else None}), 200

# =========================
# Delete listing (OWNER)
# =========================
@listings_bp.delete("/listings/<int:listing_id>")
@require_role("OWNER")
def delete_listing(listing_id: int):
    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    try:
        db.session.delete(listing)
        db.session.commit()
        return jsonify({"message": "Listing deleted", "id": listing_id}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)



# =========================
# Step 1 (Create draft) + LIMIT
# =========================
@listings_bp.post("/listings/step-1")
@require_role("OWNER")
def create_step1():
    user = g.current_user
    data = request.get_json(silent=True) or {}

    # ✅ enforce limit here (backend truth)
    limit = _owner_listing_limit(user)
    active_count = _active_owner_listings_count(user)
    if active_count >= limit:
        return json_error(
            "Listing limit reached",
            403,
            fields={"limit": f"You can only have {limit} active listings (DRAFT/READY)."}
        )

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
        return jsonify({
            "message": "Draft listing created",
            "listing": listing.to_dict(),
            "limit": limit,
            "active_count": active_count + 1
        }), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)
    


# =========================
# Step 1 Place type 
# =========================

@listings_bp.patch("/listings/<int:listing_id>/step-1")
@require_role("OWNER")
def update_step1(listing_id: int):
    data = request.get_json(silent=True) or {}
    listing = _get_owned_listing_or_404(listing_id)
    if not listing:
        return json_error("Listing not found", 404)

    place_type = data.get("placeType") or data.get("place_type")
    if not place_type or not isinstance(place_type, str) or not place_type.strip():
        return json_error(
            "Validation failed",
            400,
            fields={"placeType": "Must be a non-empty string."}
        )

    listing.place_type = place_type.strip()
    listing.current_step = max(listing.current_step or 1, 1)
    listing.status = "DRAFT"

    try:
        db.session.commit()
        return jsonify({
            "message": "Step 1 saved",
            "listing": listing.to_dict()
        }), 200
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
    listing.status = "DRAFT"  # unfinished stays draft

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
    province = "Metro Manila"

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
    if isinstance(city, str) and city.strip():
        if city not in ncr:
            fields["city"] = f"Unknown city '{city}'."
        if barangay and city in ncr:
            allowed = ncr.get(city) or []
            allowed_norm = {_norm(b) for b in allowed}
            if _norm(barangay) not in allowed_norm:
                fields["barangay"] = f"Unknown barangay '{barangay}' for {city}."

    if fields:
        return json_error("Validation failed", 400, fields=fields)

    listing.location = {**data, "province": province, "zip": zip_code}
    listing.current_step = max(listing.current_step or 1, 3)
    listing.status = "DRAFT"

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

    # Validate monthly_rent (required for listings to show price)
    monthly_rent_raw = cap.get("monthly_rent")
    if monthly_rent_raw is not None:
        try:
            monthly_rent = int(monthly_rent_raw)
            if monthly_rent < 500:
                return json_error("Validation failed", 400, fields={"capacity.monthly_rent": "Minimum rent is ₱500."})
            cap["monthly_rent"] = monthly_rent
        except (TypeError, ValueError):
            return json_error("Validation failed", 400, fields={"capacity.monthly_rent": "Must be a number."})

    listing.capacity = cap
    listing.current_step = max(listing.current_step or 1, 4)
    listing.status = "DRAFT"

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
    listing.status = "DRAFT"

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
    listing.status = "DRAFT"

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
    listing.status = "DRAFT"

    return _commit_or_500({"message": "Step 7 saved", "listing": listing.to_dict()}, 200)


# =========================
# Step 8 (title + description) -> mark READY if complete and unverified
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

    # Student discount — stored in listing.student_discount (dedicated int column)
    discount_raw = data.get("student_discount_pct")
    if discount_raw is not None:
        if discount_raw in (0, "0", None, ""):
            listing.student_discount = None
        else:
            try:
                pct = int(discount_raw)
                if not (1 <= pct <= 50):
                    return json_error("Validation failed", 400,
                        fields={"student_discount_pct": "Discount must be between 1 and 50%."})
                listing.student_discount = pct
            except (TypeError, ValueError):
                return json_error("Validation failed", 400,
                    fields={"student_discount_pct": "Must be a whole number."})

    listing.current_step = max(listing.current_step or 1, 8)

    # ✅ your rule:
    # unfinished = DRAFT
    # finished = READY (if owner not verified)
    user = g.current_user
    if _is_listing_complete(listing):
        # Must have email verified before any publish/ready state
        if not bool(getattr(user, "email_verified", False)):
            listing.status = "DRAFT"
        elif bool(getattr(user, "is_verified", False)):
            listing.status = "PUBLISHED"
        else:
            listing.status = "READY"
    else:
        listing.status = "DRAFT"

    return _commit_or_500({"message": "Step 8 saved", "listing": listing.to_dict()}, 200)


# =========================
# Publish Listing (optional button)
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

    # Soft gate — must verify email before publishing
    if not bool(getattr(user, "email_verified", False)):
        return json_error(
            "Please verify your email before publishing a listing.",
            403,
            code="EMAIL_NOT_VERIFIED"
        )

    if not _is_listing_complete(listing):
        return json_error("Listing not complete", 400, fields={"listing": "Complete all steps before submitting."})

    if user.is_verified:
        listing.status = "PUBLISHED"
        msg = "Published"
    else:
        listing.status = "READY"
        msg = "Ready (blocked until owner verification)"

    return _commit_or_500(
        {"message": msg, "listing": listing.to_dict(), "owner_verified": bool(user.is_verified)},
        200
    )


# =========================
# Resident feed (PUBLISHED only)
# Supports: city, type, min_price, max_price, limit
# =========================
@listings_bp.get("/listings/feed")
def resident_feed():
    city = (request.args.get("city") or "").strip().lower()
    place_type = (request.args.get("type") or "").strip().lower()
    min_price = request.args.get("min_price", 0, type=int)
    max_price = request.args.get("max_price", 0, type=int)
    limit = request.args.get("limit", 30, type=int)
    limit = max(1, min(limit, 60))

    listings = (
        Listing.query
        .filter(Listing.status == "PUBLISHED")
        .order_by(Listing.updated_at.desc())
        .limit(200)          # load more, filter in Python since location/price are JSON
        .all()
    )

    out = []
    for l in listings:
        d = l.to_dict()

        # Filter: city (JSON field)
        if city:
            loc_city = ((d.get("location") or {}).get("city") or "").strip().lower()
            if city not in loc_city:
                continue

        # Filter: type
        if place_type:
            pt = (d.get("place_type") or "").strip().lower()
            if pt != place_type:
                continue

        # Extract price: prefer monthly_rent, fall back to price
        cap = d.get("capacity") or {}
        price = cap.get("monthly_rent") or cap.get("price") or None

        # Filter: price range
        if min_price and (price is None or price < min_price):
            continue
        if max_price and (price is None or price > max_price):
            continue

        # Cover photo
        photos = d.get("photos") or []
        cover = None
        if isinstance(photos, list) and photos:
            cover = photos[0].get("url") if isinstance(photos[0], dict) else photos[0]

        out.append({
            "id": d["id"],
            "title": d.get("title") or "Untitled space",
            "place_type": d.get("place_type") or "",
            "city": (d.get("location") or {}).get("city") or "",
            "barangay": (d.get("location") or {}).get("barangay") or "",
            "price": price,
            "student_discount": d.get("student_discount") or 0,
            "cover": cover,
            "status": d.get("status"),
            "capacity": cap,
            "amenities": d.get("amenities"),
            "highlights": d.get("highlights"),
            "description": d.get("description"),
        })

        if len(out) >= limit:
            break

    return jsonify({"listings": out, "total": len(out)}), 200