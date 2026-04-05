# ============================================================
#  VISTA-HR · app/routes/amenities.py
#
#  PROPERTY OWNER endpoints:
#    GET  /amenities              — system amenities + own custom ones
#    GET  /highlights             — system highlights + own custom ones
#    POST /amenities              — create custom amenity (instant use)
#    POST /highlights             — create custom highlight (instant use)
#    GET  /amenities/search?q=   — autofill suggestions while typing
#
#  ADMIN endpoints:
#    GET   /admin/amenities/pending      — all pending custom amenities
#    PATCH /admin/amenities/<id>/approve — apply to all POs
#    PATCH /admin/amenities/<id>/reject  — reject system-wide
#    DELETE /admin/amenities/<id>        — hard delete
#
#  SEEDER:
#    POST /admin/amenities/seed   — populate default system amenities
# ============================================================

from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_
from ..extensions import db
from ..models.amenity import Amenity
from ..auth.jwt import require_role
from ..utils.errors import json_error
from .notifications import create_notification
from ..models.user import User

amenities_bp = Blueprint("amenities", __name__)


# ══ PROPERTY OWNER — Read ════════════════════════════════════

@amenities_bp.get("/amenities")
@require_role("OWNER", "RESIDENT", "ADMIN")
def list_amenities():
    """
    Returns amenities visible to the current PO:
    - All system amenities (is_system=True, is_active=True)
    - Their own custom amenities (owner_id=me, is_active=True)
    Grouped by category: { appliances: [...], activities: [...], safety: [...] }
    """
    me = g.current_user

    rows = Amenity.query.filter(
        Amenity.type == "amenity",
        Amenity.is_active == True,
        or_(
            Amenity.is_system == True,
            Amenity.owner_id  == me.id,
        )
    ).order_by(Amenity.category, Amenity.sort_order, Amenity.label).all()

    grouped = {}
    for r in rows:
        grouped.setdefault(r.category, []).append(r.to_dict())

    return jsonify({"amenities": grouped}), 200


@amenities_bp.get("/highlights")
@require_role("OWNER", "RESIDENT", "ADMIN")
def list_highlights():
    """
    Returns highlights visible to the current PO:
    - All system highlights
    - Their own custom highlights
    """
    me = g.current_user

    rows = Amenity.query.filter(
        Amenity.type == "highlight",
        Amenity.is_active == True,
        or_(
            Amenity.is_system == True,
            Amenity.owner_id  == me.id,
        )
    ).order_by(Amenity.sort_order, Amenity.label).all()

    return jsonify({"highlights": [r.to_dict() for r in rows]}), 200


@amenities_bp.get("/amenities/search")
@require_role("OWNER")
def search_amenities():
    """
    Autofill suggestions as PO types a custom amenity name.
    Searches both system + all approved custom amenities.
    Returns max 8 suggestions.
    """
    q    = (request.args.get("q") or "").strip()
    kind = (request.args.get("type") or "amenity").strip()  # "amenity" or "highlight"

    if not q or len(q) < 2:
        return jsonify({"suggestions": []}), 200

    rows = Amenity.query.filter(
        Amenity.type     == kind,
        Amenity.is_active == True,
        Amenity.label.ilike(f"%{q}%"),
        or_(
            Amenity.is_system == True,
            Amenity.status    == "APPROVED",
        )
    ).order_by(Amenity.is_system.desc(), Amenity.label).limit(8).all()

    return jsonify({"suggestions": [r.to_dict() for r in rows]}), 200


# ══ PROPERTY OWNER — Create custom ═══════════════════════════

@amenities_bp.post("/amenities")
@require_role("OWNER")
def create_custom_amenity():
    """
    PO creates a custom amenity.
    - Instantly usable in their own listings
    - status = PENDING (admin will decide if apply to all)
    - Admin gets a notification
    """
    me   = g.current_user
    data = request.get_json(silent=True) or {}

    label    = (data.get("label") or "").strip()
    category = (data.get("category") or "").strip().lower()
    icon     = (data.get("icon") or "sparkles").strip()

    if not label:
        return json_error("Label is required", 400)
    if category not in ("appliances", "activities", "safety"):
        return json_error("Category must be: appliances, activities, or safety", 400)

    # Check if exact same label already exists (system or own)
    existing = Amenity.query.filter(
        Amenity.type     == "amenity",
        Amenity.label    == label,
        Amenity.category == category,
        or_(Amenity.is_system == True, Amenity.owner_id == me.id)
    ).first()
    if existing:
        # Return existing one instead of duplicate
        return jsonify({
            "message": "Already exists",
            "amenity": existing.to_dict()
        }), 200

    amenity = Amenity(
        label    = label,
        category = category,
        icon     = icon,
        type     = "amenity",
        is_system= False,
        owner_id = me.id,
        status   = "PENDING",
    )
    db.session.add(amenity)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    # Notify all admins about the new custom amenity
    admins = User.query.filter_by(role="ADMIN").all()
    owner_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or me.email
    for admin in admins:
        create_notification(
            user_id    = admin.id,
            notif_type = "NEW_CUSTOM_AMENITY",
            title      = f"New custom amenity submitted",
            body       = f'{owner_name} added "{label}" — review to apply system-wide.',
        )

    return jsonify({
        "message": "Created — usable immediately. Pending admin review for system-wide.",
        "amenity": amenity.to_dict()
    }), 201


@amenities_bp.post("/highlights")
@require_role("OWNER")
def create_custom_highlight():
    """
    PO creates a custom highlight.
    Same flow as custom amenity.
    """
    me   = g.current_user
    data = request.get_json(silent=True) or {}

    label = (data.get("label") or "").strip()
    icon  = (data.get("icon") or "sparkles").strip()
    key   = (data.get("key") or label.upper().replace(" ", "_")).strip()

    if not label:
        return json_error("Label is required", 400)

    existing = Amenity.query.filter(
        Amenity.type == "highlight",
        Amenity.label == label,
        or_(Amenity.is_system == True, Amenity.owner_id == me.id)
    ).first()
    if existing:
        return jsonify({"message": "Already exists", "highlight": existing.to_dict()}), 200

    hl = Amenity(
        label    = label,
        key      = key,
        icon     = icon,
        type     = "highlight",
        is_system= False,
        owner_id = me.id,
        status   = "PENDING",
    )
    db.session.add(hl)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    # Notify admins
    admins = User.query.filter_by(role="ADMIN").all()
    owner_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or me.email
    for admin in admins:
        create_notification(
            user_id    = admin.id,
            notif_type = "NEW_CUSTOM_AMENITY",
            title      = f"New custom highlight submitted",
            body       = f'{owner_name} added "{label}" — review to apply system-wide.',
        )

    return jsonify({
        "message": "Created — usable immediately. Pending admin review for system-wide.",
        "highlight": hl.to_dict()
    }), 201


# ══ ADMIN — Review custom amenities ══════════════════════════

@amenities_bp.get("/admin/amenities/pending")
@require_role("ADMIN")
def admin_pending_amenities():
    """All custom amenities/highlights pending admin review."""
    rows = Amenity.query.filter_by(
        is_system=False,
        status="PENDING",
        is_active=True,
    ).order_by(Amenity.created_at.desc()).all()

    result = []
    for r in rows:
        d = r.to_dict()
        # Include owner info
        owner = db.session.get(User, r.owner_id) if r.owner_id else None
        if owner:
            d["owner_name"]  = f"{owner.first_name or ''} {owner.last_name or ''}".strip() or owner.email
            d["owner_email"] = owner.email
        result.append(d)

    return jsonify({"pending": result, "total": len(result)}), 200


@amenities_bp.patch("/admin/amenities/<int:amenity_id>/approve")
@require_role("ADMIN")
def admin_approve_amenity(amenity_id):
    """
    Apply to all — makes this custom amenity available to ALL POs.
    Sets is_system=True, status=APPROVED.
    """
    amenity = db.session.get(Amenity, amenity_id)
    if not amenity:
        return json_error("Amenity not found", 404)

    amenity.is_system = True
    amenity.status    = "APPROVED"
    amenity.owner_id  = None  # no longer tied to one PO

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    return jsonify({
        "message": f'"{amenity.label}" is now available to all Property Owners.',
        "amenity": amenity.to_dict()
    }), 200


@amenities_bp.patch("/admin/amenities/<int:amenity_id>/reject")
@require_role("ADMIN")
def admin_reject_amenity(amenity_id):
    """
    Reject system-wide — PO can still use it for their own listings.
    Sets status=REJECTED, is_system stays False.
    """
    amenity = db.session.get(Amenity, amenity_id)
    if not amenity:
        return json_error("Amenity not found", 404)

    amenity.status = "REJECTED"

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)

    return jsonify({
        "message": f'"{amenity.label}" rejected for system-wide use. PO can still use it.',
        "amenity": amenity.to_dict()
    }), 200


@amenities_bp.delete("/admin/amenities/<int:amenity_id>")
@require_role("ADMIN")
def admin_delete_amenity(amenity_id):
    amenity = db.session.get(Amenity, amenity_id)
    if not amenity:
        return json_error("Amenity not found", 404)
    db.session.delete(amenity)
    try:
        db.session.commit()
        return jsonify({"message": "Deleted"}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)


@amenities_bp.patch("/admin/amenities/<int:amenity_id>")
@require_role("ADMIN")
def admin_update_amenity(amenity_id):
    """Edit label, icon, category, sort_order, is_active."""
    amenity = db.session.get(Amenity, amenity_id)
    if not amenity:
        return json_error("Amenity not found", 404)

    data = request.get_json(silent=True) or {}
    if "label"      in data: amenity.label      = data["label"].strip()
    if "icon"       in data: amenity.icon        = data["icon"].strip()
    if "category"   in data: amenity.category   = data["category"].strip().lower()
    if "is_active"  in data: amenity.is_active   = bool(data["is_active"])
    if "sort_order" in data: amenity.sort_order  = int(data["sort_order"])

    try:
        db.session.commit()
        return jsonify({"message": "Updated", "amenity": amenity.to_dict()}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)


# ══ SEEDER ════════════════════════════════════════════════════

@amenities_bp.post("/admin/amenities/seed")
@require_role("ADMIN")
def seed_amenities():
    """
    Seeds default system amenities and highlights.
    Safe to call multiple times — skips existing entries.
    Run this ONCE after deploying.
    """
    DEFAULT_AMENITIES = [
        ("Air conditioning",  "appliances", "wind"),
        ("Electric fan",      "appliances", "fan"),
        ("Refrigerator",      "appliances", "refrigerator"),
        ("Microwave",         "appliances", "microwave"),
        ("Rice cooker",       "appliances", "cooking-pot"),
        ("Electric kettle",   "appliances", "zap"),
        ("Induction stove",   "appliances", "flame"),
        ("Washing machine",   "appliances", "washing-machine"),
        ("Water heater",      "appliances", "flame"),
        ("TV",                "appliances", "tv"),
        ("WiFi",              "appliances", "wifi"),
        ("Swimming pool",     "activities", "waves"),
        ("Gym",               "activities", "dumbbell"),
        ("Basketball court",  "activities", "dribbble"),
        ("Playground",        "activities", "trees"),
        ("Garden",            "activities", "leaf"),
        ("Rooftop access",    "activities", "building"),
        ("BBQ area",          "activities", "flame"),
        ("Co-working space",  "activities", "laptop"),
        ("Function room",     "activities", "users"),
        ("24/7 security",     "safety", "shield"),
        ("CCTV",              "safety", "camera"),
        ("Fire extinguisher", "safety", "flame-kindling"),
        ("Smoke detector",    "safety", "bell-ring"),
        ("First aid kit",     "safety", "cross"),
        ("Gated property",    "safety", "door-open"),
        ("Secure parking",    "safety", "car"),
        ("Elevator",          "safety", "arrow-up"),
        ("Backup generator",  "safety", "zap"),
    ]

    DEFAULT_HIGHLIGHTS = [
        ("PEACEFUL",        "Peaceful",           "sparkles"),
        ("FAMILY_FRIENDLY", "Family-friendly",    "baby"),
        ("WORK_FRIENDLY",   "Work-friendly",      "laptop"),
        ("NEAR_TRANSIT",    "Near transit",       "train-front-tunnel"),
        ("NEAR_MALLS",      "Near malls",         "shopping-bag"),
        ("CITY_CENTER",     "City center",        "building"),
        ("GREAT_VIEW",      "Great view",         "binoculars"),
        ("FAST_WIFI",       "Fast Wi-Fi",         "zap"),
        ("PET_FRIENDLY",    "Pet-friendly",       "heart"),
        ("BUDGET_FRIENDLY", "Budget-friendly",    "badge-check"),
        ("LUXE_FEEL",       "Premium feel",       "sparkles"),
        ("SAFE_AREA",       "Safe neighborhood",  "shield"),
        ("NEWLY_RENOVATED", "Newly renovated",    "paintbrush"),
        ("COZY",            "Cozy",               "house"),
        ("SPACIOUS",        "Spacious",           "expand"),
        ("BRIGHT",          "Bright & airy",      "sun"),
        ("QUIET_NIGHTS",    "Quiet nights",       "moon"),
        ("LONG_STAY",       "Long-stay ready",    "calendar-days"),
        ("SELF_CHECKIN",    "Self check-in",      "key"),
        ("WELL_EQUIPPED",   "Well-equipped",      "check-circle-2"),
        ("CLEAN",           "Very clean",         "sparkles"),
        ("NEAR_SCHOOLS",    "Near schools",       "graduation-cap"),
        ("NEAR_HOSPITALS",  "Near hospitals",     "heart-pulse"),
    ]

    added_a = added_h = 0

    for i, (label, category, icon) in enumerate(DEFAULT_AMENITIES):
        exists = Amenity.query.filter_by(
            label=label, category=category, type="amenity", is_system=True
        ).first()
        if not exists:
            db.session.add(Amenity(
                label=label, category=category, icon=icon,
                type="amenity", is_system=True, status="APPROVED",
                sort_order=i,
            ))
            added_a += 1

    for i, (key, label, icon) in enumerate(DEFAULT_HIGHLIGHTS):
        exists = Amenity.query.filter_by(
            key=key, type="highlight", is_system=True
        ).first()
        if not exists:
            db.session.add(Amenity(
                key=key, label=label, icon=icon,
                type="highlight", is_system=True, status="APPROVED",
                sort_order=i,
            ))
            added_h += 1

    try:
        db.session.commit()
        return jsonify({
            "message":          "Seed complete",
            "amenities_added":  added_a,
            "highlights_added": added_h,
        }), 200
    except Exception:
        db.session.rollback()
        return json_error("Seed failed", 500)