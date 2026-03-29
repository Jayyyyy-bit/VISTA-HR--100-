from datetime import datetime, timezone
from ..extensions import db


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)

    listing_id = db.Column(
        db.Integer,
        db.ForeignKey("listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resident_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    rating = db.Column(db.SmallInteger, nullable=False)   # 1–5
    comment = db.Column(db.Text, nullable=True)

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    listing = db.relationship("Listing", backref=db.backref("reviews", lazy=True))
    resident = db.relationship("User", foreign_keys=[resident_id])

    __table_args__ = (
        # One review per resident per listing
        db.UniqueConstraint("listing_id", "resident_id", name="uq_review_listing_resident"),
    )

    def to_dict(self):
        resident = self.resident
        name = ""
        if resident:
            first = (resident.first_name or "").strip()
            last = (resident.last_name or "").strip()
            name = f"{first} {last}".strip() or resident.email
        return {
            "id": self.id,
            "listing_id": self.listing_id,
            "resident_id": self.resident_id,
            "resident_name": name,
            "rating": self.rating,
            "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }