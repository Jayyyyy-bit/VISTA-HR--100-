"""
app/routes/feedback.py
----------------------
POST   /feedback       — auth (RESIDENT/OWNER), submit feedback
GET    /feedback       — public, fetch feedback for landing page
DELETE /feedback/<id>  — auth (ADMIN), remove feedback
"""

from __future__ import annotations
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import SQLAlchemyError

import re

from ..extensions import db
from ..utils.errors import json_error
from ..auth.jwt import require_role

feedback_bp = Blueprint("feedback", __name__)

# Server-side profanity filter — mirrors frontend list
_PROFANITY = {
    # English
    "fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "bastard",
    "motherfucker", "fucker", "fuckin", "nigger", "nigga", "faggot", "retard",
    "whore", "slut", "cock", "piss", "damn",
    # Tagalog / Filipino
    "putang", "putangina", "tangina", "tanga", "gago", "gaga", "bobo", "bwisit",
    "ulol", "tarantado", "pakshet", "pakyu", "lintik", "hinayupak", "leche",
    "siraulo", "engot", "inutil", "puke", "pepe", "titi", "kantot", "jakol",
    "tamod", "burat" , "tite", "pepe", "G@g0", "tanga", "bugok", "bulok" "niga", "inanyo", "kingina", "kinginanyo", "haulol", "kagaguhan", 
    "Tanginanyo", "tanginanyo"
}

def _contains_profanity(text: str) -> bool:
    lowered = re.sub(r"[^a-z\s]", " ", (text or "").lower())
    tokens = set(lowered.split())
    return bool(tokens & _PROFANITY)


class Feedback(db.Model):
    __tablename__ = "feedback"

    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(120), nullable=False)
    email      = db.Column(db.String(255), nullable=True)
    role       = db.Column(db.String(50),  nullable=True)   # "Resident" | "Property Owner" | etc
    message    = db.Column(db.Text,        nullable=False)
    rating     = db.Column(db.Integer,     nullable=True)   # 1-5 optional star
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        from ..models.user import User as _User
        user = db.session.get(_User, self.user_id) if self.user_id else None
        return {
            "id":         self.id,
            "name":       self.name,
            "role":       self.role,
            "message":    self.message,
            "rating":     self.rating,
            "avatar_url": user.avatar_url if user else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


@feedback_bp.post("/feedback")
@require_role("RESIDENT", "OWNER")
def submit_feedback():
    from flask import g
    data    = request.get_json(silent=True) or {}
    name    = (data.get("name")    or "").strip()
    message = (data.get("message") or "").strip()
    email   = (data.get("email")   or "").strip() or None
    role    = (data.get("role")    or "").strip() or None
    rating  = data.get("rating")

    if not name:
        return json_error("Name is required.", 400)
    if not message:
        return json_error("Message is required.", 400)
    if _contains_profanity(message) or _contains_profanity(name):
        return json_error("Please keep your feedback respectful. Profanity is not allowed.", 400)
    if rating is not None:
        try:
            rating = int(rating)
            if not (1 <= rating <= 5):
                raise ValueError
        except (TypeError, ValueError):
            return json_error("Rating must be 1–5.", 400)

    fb = Feedback(name=name, email=email, role=role, message=message, rating=rating,
                  user_id=g.current_user.id)
    try:
        db.session.add(fb)
        db.session.commit()
        return jsonify({"message": "Feedback submitted. Thank you!"}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)


@feedback_bp.get("/feedback")
def get_feedback():
    limit = min(int(request.args.get("limit", 12)), 50)
    items = (
        Feedback.query
        .order_by(Feedback.created_at.desc())
        .limit(limit).all()
    )
    return jsonify({"feedback": [f.to_dict() for f in items]}), 200


@feedback_bp.delete("/feedback/<int:feedback_id>")
@require_role("ADMIN")
def delete_feedback(feedback_id):
    fb = db.session.get(Feedback, feedback_id)
    if not fb:
        return json_error("Feedback not found.", 404)
    try:
        db.session.delete(fb)
        db.session.commit()
        return jsonify({"message": "Feedback deleted."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)