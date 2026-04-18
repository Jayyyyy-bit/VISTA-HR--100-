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
    SECRET_KEY           = os.getenv("SECRET_KEY", "dev-secret-change-me-32chars")
    GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:5000/api/auth/google/callback")

    # Gmail SMTP — set in .env
    # Gmail SMTP — kept for reference, not used (Resend handles email now)
    # Gmail SMTP (App Password)
    #MAIL_USER         = os.getenv("GMAIL_USER", "")
    #GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")

    # Resend
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM    = os.getenv("RESEND_FROM", "VISTA-HR <onboarding@resend.dev>")

    # Abstract API — email validation (optional, falls back to regex if unset)
    ABSTRACT_API_KEY   = os.getenv("ABSTRACT_API_KEY", "")

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-flask-session-key-change-me")