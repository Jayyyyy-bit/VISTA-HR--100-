import os

class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))
 