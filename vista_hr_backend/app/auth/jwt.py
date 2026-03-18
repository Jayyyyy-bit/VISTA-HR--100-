from datetime import datetime, timedelta, timezone
import jwt
from flask import current_app, request, g

from ..models import User
from ..utils.errors import json_error


COOKIE_NAME = "access_token"


def create_access_token(user: User) -> str:
    minutes = current_app.config.get("JWT_EXPIRES_MINUTES", 60)
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user.id),           # must be string
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
    }

    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


def _get_token_from_request() -> str | None:
    # 1) Cookie (recommended)
    tok = request.cookies.get(COOKIE_NAME)
    if tok:
        return tok

    # 2) Authorization header (optional fallback)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.replace("Bearer ", "").strip()

    return None


import functools

def require_auth(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        token = _get_token_from_request()
        if not token:
            return json_error("Not authenticated", 401)

        try:
            payload = decode_access_token(token)
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
        g.token_payload = payload
        return fn(*args, **kwargs)

    return wrapper


def require_role(*roles):
    def decorator(fn):
        @require_auth
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            user = g.current_user
            if user.role not in roles:
                return json_error("Forbidden", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator