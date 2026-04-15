from flask import Blueprint, jsonify, g

from ..utils.errors import json_error
from ..extensions import db
from ..models.notification import Notification
from ..auth.jwt import require_role

notifications_bp = Blueprint("notifications", __name__)

def create_notification(user_id: int, notif_type: str, title: str, body: str = None):
    notif = Notification(user_id=user_id, type=notif_type, title=title, body=body)
    db.session.add(notif)
    db.session.commit()

@notifications_bp.get("/notifications")
@require_role("RESIDENT", "OWNER", "ADMIN")
def get_notifications():
    user = g.current_user
    notifs = (
        Notification.query
        .filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(30).all()
    )
    unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return jsonify({"notifications": [n.to_dict() for n in notifs], "unread": unread}), 200

@notifications_bp.post("/notifications/mark-read")
@require_role("RESIDENT", "OWNER", "ADMIN")
def mark_all_read():
    user = g.current_user
    Notification.query.filter_by(user_id=user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All marked as read"}), 200

@notifications_bp.patch("/notifications/<int:notif_id>/read")
@require_role("RESIDENT", "OWNER", "ADMIN")
def mark_one_read(notif_id: int):
    """Mark a single notification as read. Safe even if already read."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return json_error("Not found", 404)
    if notif.user_id != g.current_user.id:
        return json_error("Forbidden", 403)
    if not notif.is_read:
        notif.is_read = True
        db.session.commit()
    return jsonify({"message": "Marked as read"}), 200

@notifications_bp.delete("/notifications/<int:notif_id>")
@require_role("RESIDENT", "OWNER", "ADMIN")
def delete_notification(notif_id):
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return json_error("Not found", 404)
    if notif.user_id != g.current_user.id:
        return json_error("Forbidden", 403)
    try:
        db.session.delete(notif)
        db.session.commit()
        return jsonify({"message": "Deleted"}), 200
    except Exception:
        db.session.rollback()
        return json_error("Database error", 500)