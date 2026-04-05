from datetime import datetime, timezone
from ..extensions import db


class SavedListing(db.Model):
    __tablename__ = "saved_listings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
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
    saved_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "listing_id", name="uq_saved"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "listing_id": self.listing_id,
            "saved_at": self.saved_at.isoformat() if self.saved_at else None,
        }