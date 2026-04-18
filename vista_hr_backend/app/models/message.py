from datetime import datetime, timezone
from ..extensions import db

MESSAGE_MAX_LENGTH = 2000


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)

    sender_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receiver_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    listing_id = db.Column(
        db.Integer,
        db.ForeignKey("listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    text      = db.Column(db.String(MESSAGE_MAX_LENGTH), nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    is_read   = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    # Soft-delete per participant (delete for me only)
    deleted_by_sender   = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    deleted_by_receiver = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    sender   = db.relationship("User", foreign_keys=[sender_id])
    receiver = db.relationship("User", foreign_keys=[receiver_id])
    listing  = db.relationship("Listing", foreign_keys=[listing_id])

    def to_dict(self, me_id=None):
        sender = self.sender
        sender_name = ""
        if sender:
            first = (sender.first_name or "").strip()
            last  = (sender.last_name  or "").strip()
            sender_name = f"{first} {last}".strip() or sender.email

        is_own = bool(me_id and self.sender_id == me_id)
        deleted = (is_own and bool(self.deleted_by_sender)) or \
                  (not is_own and bool(self.deleted_by_receiver))

        return {
            "id":          self.id,
            "sender_id":   self.sender_id,
            "receiver_id": self.receiver_id,
            "listing_id":  self.listing_id,
            "text":        "[Message deleted]" if deleted else (self.text or ""),
            "image_url":   None if deleted else self.image_url,
            "is_read":     bool(self.is_read),
            "from":        "me" if is_own else "them",
            "sender_name": sender_name,
            "deleted":     deleted,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }


class ArchivedConversation(db.Model):
    """Tracks which threads a user has archived — one row per user+thread."""
    __tablename__ = "archived_conversations"

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    listing_id    = db.Column(db.Integer, db.ForeignKey("listings.id", ondelete="CASCADE"), nullable=False)
    other_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    archived_at   = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "listing_id", "other_user_id", name="uq_archive"),
    )