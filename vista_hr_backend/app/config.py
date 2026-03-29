import os
import cloudinary
import os

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    # Guard: warn if missing, enforce minimum 32-byte length for HS256
    if not JWT_SECRET:
        import warnings
        warnings.warn(
            "JWT_SECRET is not set in .env — using insecure fallback. "
            "Set a strong random secret (32+ chars) before deploying.",
            stacklevel=2,
        )
        JWT_SECRET = "dev-secret-change-me-minimum-32ch"  # exactly 32 chars — dev only
    elif len(JWT_SECRET.encode()) < 32:
        import warnings
        warnings.warn(
            f"JWT_SECRET is only {len(JWT_SECRET.encode())} bytes — "
            "minimum recommended is 32 bytes for HS256. Update your .env.",
            stacklevel=2,
        )
    JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))

    # Gmail SMTP — set in .env
    MAIL_SENDER   = os.getenv("MAIL_SENDER", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")