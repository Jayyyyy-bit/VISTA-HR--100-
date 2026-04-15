from datetime import datetime, timezone
from ..extensions import db

# review_type values:
#   LISTING  — resident reviews a listing (existing flow, requires COMPLETED booking)
#   OWNER    — resident reviews the property owner (on move-in / ACTIVE)
#   RESIDENT — owner reviews the resident (on move-out)
#   SYSTEM   — resident OR owner rates the VISTA-HR platform

class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)

    # Reviewer — always set
    reviewer_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reviewer_role = db.Column(db.String(10), nullable=False)  # RESIDENT | OWNER

    # Review type
    review_type = db.Column(
        db.Enum("LISTING", "OWNER", "RESIDENT", "SYSTEM", name="review_type_enum"),
        nullable=False,
        default="LISTING",
        index=True,
    )

    # Target — nullable for SYSTEM reviews; listing_id for LISTING; target_user_id for OWNER/RESIDENT
    listing_id = db.Column(
        db.Integer,
        db.ForeignKey("listings.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    target_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Booking context — ties review to a specific booking for dedup
    booking_id = db.Column(
        db.Integer,
        db.ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    rating  = db.Column(db.SmallInteger, nullable=False)  # 1–5
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
    listing     = db.relationship("Listing", backref=db.backref("reviews", lazy=True),
                                  foreign_keys=[listing_id])
    reviewer    = db.relationship("User", foreign_keys=[reviewer_id])
    target_user = db.relationship("User", foreign_keys=[target_user_id])

    # One review per reviewer per booking per type — prevents double-submitting
    __table_args__ = (
        db.UniqueConstraint(
            "reviewer_id", "booking_id", "review_type",
            name="uq_review_reviewer_booking_type"
        ),
    )

    def to_dict(self):
        reviewer = self.reviewer
        r_name = ""
        if reviewer:
            first = (reviewer.first_name or "").strip()
            last  = (reviewer.last_name  or "").strip()
            r_name = f"{first} {last}".strip() or reviewer.email

        target = self.target_user
        t_name = ""
        if target:
            first = (target.first_name or "").strip()
            last  = (target.last_name  or "").strip()
            t_name = f"{first} {last}".strip() or target.email

        return {
            "id":             self.id,
            "reviewer_id":    self.reviewer_id,
            "reviewer_name":  r_name,
            "reviewer_role":  self.reviewer_role,
            "review_type":    self.review_type,
            "listing_id":     self.listing_id,
            "target_user_id": self.target_user_id,
            "target_name":    t_name or None,
            "booking_id":     self.booking_id,
            "rating":         self.rating,
            "comment":        self.comment,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }