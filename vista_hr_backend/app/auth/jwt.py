from datetime import datetime, timedelta, timezone
import jwt
from flask import current_app, request, g

from ..models import User
from ..utils.errors import json_error

def create_access_token(user: User) -> str:
    minutes = current_app.config["JWT_EXPIRES_MINUTES"]
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": now + timedelta(minutes=minutes),
        "iat": now,
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")

def decode_token(token: str):
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])

def create_access_token(user: User) -> str:
    minutes = current_app.config["JWT_EXPIRES_MINUTES"]
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),   # ✅ must be string
        "role": user.role,
        "exp": now + timedelta(minutes=minutes),
        "iat": now,
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def require_auth(fn):
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return json_error("Missing or invalid Authorization header", 401)

        token = auth.replace("Bearer ", "").strip()
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return json_error("Token expired", 401)
        except jwt.InvalidTokenError as e:
            return json_error("Invalid token", 401, detail=str(e))

        sub = payload.get("sub")
        try:
            user_id = int(sub)
        except (TypeError, ValueError):
            return json_error("Invalid token subject", 401)

        user = User.query.get(user_id)
        if not user:
            return json_error("User not found", 401)

        g.current_user = user
        return fn(*args, **kwargs)

    wrapper.__name__ = fn.__name__
    return wrapper


def require_role(*roles):
    def decorator(fn):
        @require_auth
        def wrapper(*args, **kwargs):
            user = g.current_user
            if user.role not in roles:
                return json_error("Forbidden", 403)
            return fn(*args, **kwargs)
        wrapper.__name__ = fn.__name__
        return wrapper
    return decorator
