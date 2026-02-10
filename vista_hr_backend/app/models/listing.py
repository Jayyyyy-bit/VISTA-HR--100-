from datetime import datetime
from sqlalchemy import Enum
from ..extensions import db

LISTING_STATUS = ("DRAFT", "PENDING_VERIFICATION", "PUBLISHED", "ARCHIVED")

class Listing(db.Model):
    __tablename__ = "listings"

    id = db.Column(db.Integer, primary_key=True)

    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    status = db.Column(Enum(*LISTING_STATUS, name="listing_status"),
                       nullable=False, default="DRAFT", server_default="DRAFT", index=True)

    current_step = db.Column(db.SmallInteger, nullable=False, default=1, server_default="1")

    # Wizard columns
    place_type = db.Column(db.String(30), nullable=True)   # Step 1
    space_type = db.Column(db.String(30), nullable=True)   # Step 2
    location = db.Column(db.JSON, nullable=True)           # Step 3
    capacity = db.Column(db.JSON, nullable=True)           # Step 4
    amenities = db.Column(db.JSON, nullable=True)          # Step 5
    highlights = db.Column(db.JSON, nullable=True)         # Step 6
    photos = db.Column(db.JSON, nullable=True)             # Step 7

    title = db.Column(db.String(120), nullable=True)       # Step 8
    description = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

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
            "title": self.title,
            "description": self.description,
        }
