from datetime import datetime, timezone
from sqlalchemy import Enum
from ..extensions import db

LISTING_STATUS = ("DRAFT", "READY", "PUBLISHED", "ARCHIVED")  # must match DB Enum


class Listing(db.Model):
    __tablename__ = "listings"

    id = db.Column(db.Integer, primary_key=True)

    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    status = db.Column(
        db.Enum("DRAFT", "READY", "PUBLISHED", "ARCHIVED", name="listing_status"),
        nullable=False,
        default="DRAFT",
    )
    current_step = db.Column(
        db.SmallInteger,
        nullable=False,
        default=1,
        server_default="1"
    )

    # Wizard columns
    place_type = db.Column(db.String(30), nullable=True)    # Step 1
    space_type = db.Column(db.String(30), nullable=True)    # Step 2
    location = db.Column(db.JSON, nullable=True)            # Step 3
    capacity = db.Column(db.JSON, nullable=True)            # Step 4
    amenities = db.Column(db.JSON, nullable=True)           # Step 5
    highlights = db.Column(db.JSON, nullable=True)          # Step 6
    photos = db.Column(db.JSON, nullable=True)              # Step 7 regular photos
    virtual_tour = db.Column(db.JSON, nullable=True)        # Step 7 optional 360 tour

    title = db.Column(db.String(120), nullable=True)        # Step 8
    description = db.Column(db.Text, nullable=True)

    # Student discount set by property owner
    student_discount = db.Column(db.SmallInteger, nullable=True)

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "owner_id": self.owner_id,
            "status": self.status,
            "current_step": self.current_step,
            "place_type": self.place_type,
            "space_type": self.space_type,
            "location": self.location,
            "capacity": self.capacity,
            "amenities": self.amenities,
            "highlights": self.highlights,
            "photos": self.photos,
            "virtualTour": self.virtual_tour or {
                "enabled": False,
                "panoUrl": "",
                "panoPublicId": "",
            },
            "title": self.title,
            "description": self.description,
            "student_discount": self.student_discount,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }