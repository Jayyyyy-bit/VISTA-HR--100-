from datetime import datetime
from sqlalchemy import Enum
from ..extensions import db

BOOKING_STATUS = ("PENDING", "APPROVED", "REJECTED", "CANCELLED")

class Booking(db.Model):
    __tablename__ = "bookings"

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

    status = db.Column(
        db.Enum(*BOOKING_STATUS, name="booking_status"),
        nullable=False,
        default="PENDING",
        server_default="PENDING",
    )

    move_in_date = db.Column(db.Date, nullable=True)
    message = db.Column(db.Text, nullable=True)

    # Owner response note (optional)
    owner_note = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships (lazy=True is fine for this scale)
    listing = db.relationship("Listing", backref=db.backref("bookings", lazy=True))
    resident = db.relationship("User", foreign_keys=[resident_id])

    def to_dict(self):
        listing = self.listing
        location = (listing.location or {}) if listing else {}
        photos = (listing.photos or []) if listing else []
        cover = None
        if isinstance(photos, list) and photos:
            cover = photos[0].get("url") if isinstance(photos[0], dict) else photos[0]

        resident = self.resident
        resident_first = (resident.first_name or "").strip() if resident else ""
        resident_last  = (resident.last_name  or "").strip() if resident else ""
        resident_name  = f"{resident_first} {resident_last}".strip() or (resident.email if resident else None)

        return {
            "id": self.id,
            "listing_id": self.listing_id,
            "resident_id": self.resident_id,
            "resident_name": resident_name,
            "resident_email": resident.email if resident else None,
            "status": self.status,
            "move_in_date": self.move_in_date.isoformat() if self.move_in_date else None,
            "message": self.message,
            "owner_note": self.owner_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Denormalized listing snapshot for easy display
            "listing": {
                "title": listing.title if listing else None,
                "place_type": listing.place_type if listing else None,
                "city": location.get("city"),
                "barangay": location.get("barangay"),
                "price": (listing.capacity or {}).get("monthly_rent") if listing else None,
                "cover": cover,
            } if listing else None,
        }