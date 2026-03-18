from datetime import datetime
from sqlalchemy import Enum
from werkzeug.security import generate_password_hash, check_password_hash
from ..extensions import db

USER_ROLE = ("ADMIN", "RESIDENT", "OWNER")
KYC_STATUS = ("NONE", "PENDING", "APPROVED", "REJECTED")

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    first_name = db.Column(db.String(80), nullable=True)
    last_name = db.Column(db.String(80), nullable=True)
    phone = db.Column(db.String(30), nullable=True)

    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    role = db.Column(Enum(*USER_ROLE, name="user_role"), nullable=False, index=True)

    # ── Email OTP verification ────────────────────────────────────
    # Must be True before user can access dashboard
    email_verified = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    email_otp = db.Column(db.String(6), nullable=True)
    email_otp_expires_at = db.Column(db.DateTime, nullable=True)

    # ── Account-level verification (role-dependent) ───────────────
    # OWNER  -> True once admin approves KYC
    # RESIDENT -> True always (no KYC needed, only email OTP)
    # ADMIN  -> True always
    is_verified = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    # admin-controlled account status
    is_suspended = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    has_completed_onboarding = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )

    # ── KYC (Owner only) ─────────────────────────────────────────
    kyc_status = db.Column(
        Enum(*KYC_STATUS, name="kyc_status"),
        nullable=False,
        default="NONE",
        server_default="NONE",
    )
    kyc_id_front_url  = db.Column(db.String(500), nullable=True)
    kyc_id_back_url   = db.Column(db.String(500), nullable=True)
    kyc_selfie_url    = db.Column(db.String(500), nullable=True)
    kyc_submitted_at  = db.Column(db.DateTime, nullable=True)
    kyc_reviewed_at   = db.Column(db.DateTime, nullable=True)
    kyc_reject_reason = db.Column(db.Text, nullable=True)

    # ── Student verification (Resident only) ──────────────────────
    student_verified      = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    student_id_url        = db.Column(db.String(500), nullable=True)   # School ID
    student_cor_url       = db.Column(db.String(500), nullable=True)   # Certificate of Registration
    student_submitted_at  = db.Column(db.DateTime, nullable=True)
    student_reviewed_at   = db.Column(db.DateTime, nullable=True)
    student_reject_reason = db.Column(db.Text, nullable=True)
    student_status        = db.Column(
        Enum("NONE", "PENDING", "APPROVED", "REJECTED", name="student_status"),
        nullable=False,
        default="NONE",
        server_default="NONE",
    )

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self):
        role_val = self.role.value if hasattr(self.role, "value") else str(self.role)
        kyc_val  = self.kyc_status.value if hasattr(self.kyc_status, "value") else str(self.kyc_status or "NONE")
        stu_val  = self.student_status.value if hasattr(self.student_status, "value") else str(self.student_status or "NONE")

        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone": self.phone,
            "email": self.email,
            "role": role_val,
            "email_verified": bool(self.email_verified),
            "is_verified": bool(self.is_verified),
            "is_suspended": bool(getattr(self, "is_suspended", False)),
            "has_completed_onboarding": int(bool(getattr(self, "has_completed_onboarding", False))),
            # KYC (owners)
            "kyc_status": kyc_val,
            "kyc_reject_reason": self.kyc_reject_reason,
            # Student (residents)
            "student_verified": bool(self.student_verified),
            "student_status": stu_val,
            "student_reject_reason": self.student_reject_reason,
        }