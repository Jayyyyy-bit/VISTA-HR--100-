from datetime import datetime, timezone
from sqlalchemy import Enum
from ..extensions import db

BOOKING_STATUS = ("PENDING", "APPROVED", "VIEWING_SCHEDULED", "VIEWING_DECLINED", "ACTIVE", "COMPLETED", "MOVED_OUT", "REJECTED", "CANCELLED")

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
    move_out_date = db.Column(db.Date, nullable=True)
    message = db.Column(db.Text, nullable=True)

    # Owner response note (optional)
    owner_note = db.Column(db.Text, nullable=True)

    # Proof of payment — Cloudinary URL uploaded by resident
    payment_proof_url = db.Column(db.String(500), nullable=True)
    # True = owner confirmed payment received
    payment_verified  = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    # Timestamp when the owner approved/rejected the booking
    # Timestamp when the owner approved/rejected the booking
    approved_at = db.Column(db.DateTime, nullable=True)

    # Viewing schedule (set by owner when transitioning to VIEWING_SCHEDULED)
    viewing_date  = db.Column(db.DateTime, nullable=True)
    viewing_notes = db.Column(db.String(500), nullable=True)

    # Cancellation reason (owner-set or auto-cancel)
    cancel_reason = db.Column(db.String(500), nullable=True)

    # Contract end date (agreed end, separate from actual move_out_date)
    contract_end_date = db.Column(db.Date, nullable=True)

    # Days remaining on contract when resident moved out early
    # Days remaining on contract when resident moved out early
    days_early = db.Column(db.Integer, nullable=True)

    # Viewing declined by resident
    # Viewing declined by resident
    viewing_declined_at     = db.Column(db.DateTime, nullable=True)
    viewing_decline_reason  = db.Column(db.String(500), nullable=True)

    # Viewing confirmed by resident (prevents re-prompting on refresh)
    viewing_confirmed_at    = db.Column(db.DateTime, nullable=True)

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
            "move_out_date": self.move_out_date.isoformat() if self.move_out_date else None,
            "message": self.message,
            "owner_note": self.owner_note,
            "payment_proof_url": self.payment_proof_url,
            "payment_verified": bool(self.payment_verified),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "approved_at":       self.approved_at.isoformat() if self.approved_at else None,
            "viewing_date":      self.viewing_date.isoformat() if self.viewing_date else None,
            "viewing_notes":     self.viewing_notes,
            "cancel_reason":     self.cancel_reason,
            "contract_end_date": self.contract_end_date.isoformat() if self.contract_end_date else None,
            "days_early":              self.days_early,
            "viewing_declined_at":     self.viewing_declined_at.isoformat() if self.viewing_declined_at else None,
            "viewing_decline_reason":  self.viewing_decline_reason,
            "viewing_confirmed_at":    self.viewing_confirmed_at.isoformat() if self.viewing_confirmed_at else None,
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