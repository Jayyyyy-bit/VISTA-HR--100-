from datetime import datetime, timezone
from sqlalchemy import Enum
from ..extensions import db

TICKET_CATEGORY = ("TECHNICAL", "BILLING", "LISTING", "ACCOUNT", "OTHER")
TICKET_STATUS = ("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")


class Ticket(db.Model):
    __tablename__ = "tickets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    category = db.Column(
        Enum(*TICKET_CATEGORY, name="ticket_category"),
        nullable=False,
        default="OTHER",
        server_default="OTHER",
    )
    status = db.Column(
        Enum(*TICKET_STATUS, name="ticket_status"),
        nullable=False,
        default="OPEN",
        server_default="OPEN",
    )
    admin_reply = db.Column(db.Text, nullable=True)
    replied_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        cat_val = self.category.value if hasattr(self.category, "value") else str(self.category or "OTHER")
        sts_val = self.status.value if hasattr(self.status, "value") else str(self.status or "OPEN")
        return {
            "id": self.id,
            "user_id": self.user_id,
            "subject": self.subject,
            "body": self.body,
            "category": cat_val,
            "status": sts_val,
            "admin_reply": self.admin_reply,
            "replied_at": self.replied_at.isoformat() if self.replied_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }