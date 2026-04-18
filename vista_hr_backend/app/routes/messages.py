from __future__ import annotations

from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_, and_
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import Message, Listing, User
from ..models.message import MESSAGE_MAX_LENGTH, ArchivedConversation
from ..auth.jwt import require_role
from ..routes.notifications import create_notification
from ..utils.errors import json_error

messages_bp = Blueprint("messages", __name__)


def _other_user_id(msg, me_id):
    """Return the ID of the other participant in a message."""
    return msg.receiver_id if msg.sender_id == me_id else msg.sender_id


def _my_messages_query(me_id):
    """Base query: all messages where I am sender or receiver."""
    return Message.query.filter(
        or_(Message.sender_id == me_id, Message.receiver_id == me_id)
    )


# ══════════════════════════════════════════════
# GET /messages/conversations
# List all conversation threads for the current user
# ══════════════════════════════════════════════
@messages_bp.get("/messages/conversations")
@require_role("OWNER", "RESIDENT")
def list_conversations():
    me = g.current_user

    # Get all messages involving me
    all_msgs = (
        _my_messages_query(me.id)
        .order_by(Message.created_at.desc())
        .all()
    )

    show_archived = request.args.get("archived", "").lower() == "true"

    # Load archived thread keys for this user
    archived_rows = ArchivedConversation.query.filter_by(user_id=me.id).all()
    archived_keys = {(r.listing_id, r.other_user_id) for r in archived_rows}

    # Group into unique (listing_id, other_user_id) threads
    seen = {}
    for msg in all_msgs:
        # Skip messages deleted by this user
        is_sender = msg.sender_id == me.id
        if is_sender and bool(msg.deleted_by_sender): continue
        if not is_sender and bool(msg.deleted_by_receiver): continue

        other_id = _other_user_id(msg, me.id)
        key = (msg.listing_id, other_id)
        if key not in seen:
            seen[key] = msg  # most recent message per thread

    threads = []
    for (listing_id, other_id), last_msg in seen.items():
        # Unread count — messages FROM other TO me that are unread
        unread = Message.query.filter_by(
            listing_id=listing_id,
            sender_id=other_id,
            receiver_id=me.id,
            is_read=False,
        ).count()

        other_user = db.session.get(User, other_id)
        listing    = db.session.get(Listing, listing_id)

        if not other_user or not listing:
            continue

        first = (other_user.first_name or "").strip()
        last  = (other_user.last_name  or "").strip()
        other_name = f"{first} {last}".strip() or other_user.email
        initials = ((first[:1] + last[:1]) if first or last else other_user.email[:2]).upper()

        location = listing.location or {}
        city     = location.get("city", "")
        capacity = listing.capacity or {}
        rent     = capacity.get("monthly_rent")
        rent_str = f"₱{int(rent):,}/mo" if rent else ""
        prop_meta = f"{city} · {rent_str}".strip(" ·") if city or rent_str else ""

        photos = listing.photos or []
        cover = None
        if isinstance(photos, list) and photos:
            cover = photos[0].get("url") if isinstance(photos[0], dict) else photos[0]

        other_role     = other_user.role.value if hasattr(other_user.role, "value") else str(other_user.role)
        listing_status = listing.status.value if hasattr(listing.status, "value") else str(listing.status)

        threads.append({
            "listing_id":      listing_id,
            "other_user_id":   other_id,
            "other_name":      other_name,
            "initials":        initials,
            "other_email":     other_user.email,
            "other_phone":     other_user.phone or "",
            "other_role":      other_role,
            "other_avatar":    other_user.avatar_url or "",
            "unread":          unread,
            "last_message":    last_msg.text,
            "last_time":       last_msg.created_at.isoformat() if last_msg.created_at else None,
            "listing_title":   listing.title or f"Listing #{listing_id}",
            "listing_meta":    prop_meta,
            "listing_status":  listing_status,
            "listing_cover":   cover,
        })

    # Filter by archived status
    threads = [
        t for t in threads
        if show_archived == ((t["listing_id"], t["other_user_id"]) in archived_keys)
    ]
    # Add archived flag to each thread
    for t in threads:
        t["is_archived"] = (t["listing_id"], t["other_user_id"]) in archived_keys

    # Sort by last message time descending
    threads.sort(key=lambda t: t["last_time"] or "", reverse=True)
    return jsonify({"conversations": threads}), 200


# ══════════════════════════════════════════════
# GET /messages/conversations/<listing_id>/<other_user_id>
# Fetch all messages in a specific thread
# ══════════════════════════════════════════════
@messages_bp.get("/messages/conversations/<int:listing_id>/<int:other_user_id>")
@require_role("OWNER", "RESIDENT")
def get_thread(listing_id: int, other_user_id: int):
    me = g.current_user

    messages = (
        Message.query
        .filter(
            Message.listing_id == listing_id,
            or_(
                and_(Message.sender_id == me.id,         Message.receiver_id == other_user_id,
                     Message.deleted_by_sender == False),
                and_(Message.sender_id == other_user_id, Message.receiver_id == me.id,
                     Message.deleted_by_receiver == False),
            )
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    # Mark all unread messages from other user as read
    unread_ids = [m.id for m in messages if m.sender_id == other_user_id and not m.is_read]
    if unread_ids:
        Message.query.filter(Message.id.in_(unread_ids)).update(
            {"is_read": True}, synchronize_session=False
        )
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()

    return jsonify({
        "messages": [m.to_dict(me_id=me.id) for m in messages]
    }), 200


# ══════════════════════════════════════════════
# POST /messages
# Send a message
# ══════════════════════════════════════════════
@messages_bp.post("/messages/typing")
@require_role("OWNER", "RESIDENT")
def set_typing():
    """POST { receiver_id, listing_id } — marks sender as typing for 4s."""
    from datetime import timedelta
    me   = g.current_user
    data = request.get_json(silent=True) or {}
    me.typing_until = datetime.now(timezone.utc) + timedelta(seconds=4)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
    return jsonify({"ok": True}), 200


@messages_bp.get("/messages/typing/<int:other_user_id>")
@require_role("OWNER", "RESIDENT")
def get_typing(other_user_id: int):
    """GET — returns whether other_user is currently typing."""
    other = db.session.get(User, other_user_id)
    if not other:
        return jsonify({"is_typing": False}), 200
    if other.typing_until is None:
        is_typing = False
    else:
        until = other.typing_until if other.typing_until.tzinfo else other.typing_until.replace(tzinfo=timezone.utc)
        is_typing = until > datetime.now(timezone.utc)
    return jsonify({"is_typing": is_typing}), 200


@messages_bp.post("/messages")
@require_role("OWNER", "RESIDENT")
def send_message():
    me   = g.current_user
    data = request.get_json(silent=True) or {}

    receiver_id = data.get("receiver_id")
    listing_id  = data.get("listing_id")
    text        = (data.get("text") or "").strip()
    image_url   = (data.get("image_url") or "").strip() or None

    if not receiver_id or not isinstance(receiver_id, int):
        return json_error("Validation failed", 400, fields={"receiver_id": "Required integer."})
    if not listing_id or not isinstance(listing_id, int):
        return json_error("Validation failed", 400, fields={"listing_id": "Required integer."})
    if not text and not image_url:
        return json_error("Validation failed", 400, fields={"text": "Message cannot be empty."})
    if text and len(text) > MESSAGE_MAX_LENGTH:
        return json_error(
            "Validation failed", 400,
            fields={"text": f"Message cannot exceed {MESSAGE_MAX_LENGTH} characters."}
        )
    if receiver_id == me.id:
        return json_error("Cannot send a message to yourself.", 400)

    listing = db.session.get(Listing, listing_id)
    if not listing:
        return json_error("Listing not found.", 404)

    receiver = db.session.get(User, receiver_id)
    if not receiver:
        return json_error("Recipient not found.", 404)

    msg = Message(
        sender_id=me.id,
        receiver_id=receiver_id,
        listing_id=listing_id,
        text=text or "",
        image_url=image_url,
        is_read=False,
    )

    try:
        db.session.add(msg)
        db.session.commit()
        # Notify the receiver in-app
        sender_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or me.email
        listing_title = listing.title or f"Listing #{listing_id}"
        create_notification(
            user_id=receiver_id,
            notif_type="NEW_MESSAGE",
            title=f"New message from {sender_name}",
            body=f'Re: {listing_title} — "{text[:60]}{"…" if len(text) > 60 else ""}"',
        )

        return jsonify({
            "message": "Sent",
            "data": msg.to_dict(me_id=me.id)
        }), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════
# GET /messages/unread-count
# Quick badge count for the nav tab
# ══════════════════════════════════════════════
@messages_bp.get("/messages/unread-count")
@require_role("OWNER", "RESIDENT")
def unread_count():
    me = g.current_user
    count = Message.query.filter_by(
        receiver_id=me.id,
        is_read=False,
        deleted_by_receiver=False,
    ).count()
    return jsonify({"unread": count}), 200

# ══════════════════════════════════════════════
# DELETE /messages/conversations/<lid>/<oid>
# Delete conversation for me only (soft delete)
# ══════════════════════════════════════════════
@messages_bp.delete("/messages/conversations/<int:listing_id>/<int:other_user_id>")
@require_role("OWNER", "RESIDENT")
def delete_conversation(listing_id: int, other_user_id: int):
    """Soft-delete all messages in this thread for the current user only.
    The other participant's view is unaffected.
    """
    me = g.current_user

    messages = (
        Message.query
        .filter(
            Message.listing_id == listing_id,
            or_(
                and_(Message.sender_id == me.id,         Message.receiver_id == other_user_id),
                and_(Message.sender_id == other_user_id, Message.receiver_id == me.id),
            )
        )
        .all()
    )

    if not messages:
        return json_error("Conversation not found.", 404)

    for msg in messages:
        if msg.sender_id == me.id:
            msg.deleted_by_sender = True
        else:
            msg.deleted_by_receiver = True

    # Also remove archive entry if it exists
    ArchivedConversation.query.filter_by(
        user_id=me.id,
        listing_id=listing_id,
        other_user_id=other_user_id,
    ).delete()

    try:
        db.session.commit()
        return jsonify({"message": "Conversation deleted."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════
# POST /messages/conversations/<lid>/<oid>/archive
# Archive a conversation thread
# ══════════════════════════════════════════════
@messages_bp.post("/messages/conversations/<int:listing_id>/<int:other_user_id>/archive")
@require_role("OWNER", "RESIDENT")
def archive_conversation(listing_id: int, other_user_id: int):
    """Archive a thread for the current user. Hides it from main inbox."""
    me = g.current_user

    existing = ArchivedConversation.query.filter_by(
        user_id=me.id,
        listing_id=listing_id,
        other_user_id=other_user_id,
    ).first()

    if existing:
        return json_error("Conversation already archived.", 400)

    archive = ArchivedConversation(
        user_id=me.id,
        listing_id=listing_id,
        other_user_id=other_user_id,
    )

    try:
        db.session.add(archive)
        db.session.commit()
        return jsonify({"message": "Conversation archived."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)


# ══════════════════════════════════════════════
# DELETE /messages/conversations/<lid>/<oid>/archive
# Unarchive a conversation thread
# ══════════════════════════════════════════════
@messages_bp.delete("/messages/conversations/<int:listing_id>/<int:other_user_id>/archive")
@require_role("OWNER", "RESIDENT")
def unarchive_conversation(listing_id: int, other_user_id: int):
    """Move a conversation back to the main inbox."""
    me = g.current_user

    row = ArchivedConversation.query.filter_by(
        user_id=me.id,
        listing_id=listing_id,
        other_user_id=other_user_id,
    ).first()

    if not row:
        return json_error("Conversation is not archived.", 404)

    try:
        db.session.delete(row)
        db.session.commit()
        return jsonify({"message": "Conversation unarchived."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error", 500)