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
    # Guard: crash at startup if JWT_SECRET is missing or still default
    if not JWT_SECRET:
        import warnings
        warnings.warn(
            "JWT_SECRET is not set in .env — using insecure fallback. "
            "Set a strong random secret before deploying.",
            stacklevel=2
        )
        JWT_SECRET = "dev-secret-change-me"
    JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))

    # Gmail SMTP — set in .env
    MAIL_SENDER   = os.getenv("MAIL_SENDER", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")