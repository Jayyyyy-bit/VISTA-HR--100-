from datetime import datetime
from sqlalchemy import Enum
from werkzeug.security import generate_password_hash, check_password_hash
from ..extensions import db

USER_ROLE = ("RESIDENT", "OWNER")

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    first_name = db.Column(db.String(80), nullable=True)
    last_name = db.Column(db.String(80), nullable=True)
    phone = db.Column(db.String(30), nullable=True)

    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    role = db.Column(Enum(*USER_ROLE, name="user_role"), nullable=False, index=True)
    is_verified = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self):
        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone": self.phone,
            "email": self.email,
            "role": self.role,
            "is_verified": bool(self.is_verified),
        }
