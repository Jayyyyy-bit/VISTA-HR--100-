from flask import Blueprint, jsonify, g
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