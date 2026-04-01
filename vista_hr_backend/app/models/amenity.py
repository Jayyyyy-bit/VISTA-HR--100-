# ============================================================
#  VISTA-HR · app/models/amenity.py
#
#  Single table handles both system-wide and custom amenities.
#
#  FLOW:
#  - System amenities (is_system=True)  → visible to ALL POs immediately
#  - Custom amenities (is_system=False) → created by a specific PO,
#    usable by that PO right away, pending admin review for system-wide
#
#  STATUS:
#  - "APPROVED"  → if is_system=True, visible to all
#  - "PENDING"   → awaiting admin decision on system-wide approval
#  - "REJECTED"  → admin rejected system-wide, PO can still use for own listings
#
#  Same model is used for both Amenities (Step 5) and Highlights (Step 6)
#  differentiated by type field: "amenity" | "highlight"
# ============================================================

from ..extensions import db
from datetime import datetime, timezone


AMENITY_STATUS = ("PENDING", "APPROVED", "REJECTED")
AMENITY_CATEGORY = ("appliances", "activities", "safety", "highlight")


class Amenity(db.Model):
    __tablename__ = "amenities"

    id          = db.Column(db.Integer, primary_key=True)

    # Content
    label       = db.Column(db.String(100), nullable=False)
    icon        = db.Column(db.String(60),  nullable=False, default="sparkles")
    type        = db.Column(db.String(20),  nullable=False, default="amenity")
    # "amenity"   → Step 5 (appliances, activities, safety)
    # "highlight" → Step 6 (peaceful, pet-friendly, etc.)

    category    = db.Column(db.String(50),  nullable=True)
    # For amenities: "appliances" | "activities" | "safety"
    # For highlights: NULL

    key         = db.Column(db.String(60),  nullable=True)
    # For highlights only: e.g. "PEACEFUL", "PET_FRIENDLY"
    # NULL for amenities

    # Ownership
    is_system   = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    # TRUE  = default/system-wide, visible to all POs
    # FALSE = custom, created by a specific PO

    owner_id    = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    # NULL if is_system=True (no specific owner)
    # Set if a PO created this custom amenity

    # Admin review status
    status      = db.Column(
        db.Enum(*AMENITY_STATUS, name="amenity_status"),
        nullable=False,
        default="APPROVED",
        server_default="APPROVED"
    )
    # System amenities start as APPROVED
    # Custom amenities start as PENDING (for system-wide review)
    # But PO can use them immediately regardless

    # Visibility
    is_active   = db.Column(db.Boolean, nullable=False, default=True, server_default="1")
    sort_order  = db.Column(db.Integer, nullable=False, default=0)

    created_at  = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id":         self.id,
            "label":      self.label,
            "icon":       self.icon,
            "type":       self.type,
            "category":   self.category,
            "key":        self.key,
            "is_system":  bool(self.is_system),
            "owner_id":   self.owner_id,
            "status":     self.status,
            "is_active":  bool(self.is_active),
            "sort_order": self.sort_order,
        }