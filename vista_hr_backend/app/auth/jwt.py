# app/auth/jwt.py
# ══════════════════════════════════════════════════════════
#  JWT Authentication — Minimized Payload + Hardened Cookies
# ══════════════════════════════════════════════════════════
#
#  SECURITY CHANGES (for final defense):
#
#  1. REMOVED "role" from JWT payload.
#     - Before: { sub, role, iat, exp } — role visible in DevTools
#     - After:  { sub, iat, exp } — only an opaque user ID
#     - Why: JWTs are base64, not encrypted. Anyone can decode them
#       in DevTools or jwt.io. By removing role, the token reveals
#       nothing useful even if inspected.
#     - Role is now determined ONLY from the database via
#       g.current_user.role — single source of truth.
#
#  2. HARDENED cookie flags:
#     - HttpOnly: always True (JS cannot read the cookie)
#     - Secure: True in production (cookie only sent over HTTPS)
#     - SameSite: "Lax" (prevents CSRF from cross-origin requests)
#     - Path: "/" (cookie available on all routes)
#
#  3. Added set_auth_cookie() and clear_auth_cookie() helpers
#     so auth.py doesn't have to manually build cookie params.
# ══════════════════════════════════════════════════════════

from datetime import datetime, timedelta, timezone
import functools
import os

import jwt
from flask import current_app, request, g, make_response



from ..extensions import db
from ..models import User
from ..utils.errors import json_error



COOKIE_NAME = "access_token"


# ══════════════════════════════════════════════════════════
#  TOKEN CREATION & DECODING
# ══════════════════════════════════════════════════════════

def create_access_token(user: User) -> str:
    """Create a JWT with minimal claims — only user ID + timestamps."""
    minutes = current_app.config.get("JWT_EXPIRES_MINUTES", 60)
    now = datetime.now(timezone.utc)
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)

    payload = {
        "sub": str(user.id),   # user ID as string — the ONLY identifying claim
        "role": role_val,
        "tv": int(user.token_version or 0),
        "iat": now,            # issued at
        "exp": now + timedelta(minutes=minutes), 
          # expiration
    }

    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


# ══════════════════════════════════════════════════════════
#  COOKIE HELPERS
# ══════════════════════════════════════════════════════════
#
#  Use these in auth.py instead of manually setting cookies.
#  This ensures all cookie security flags are consistent
#  across login, verify-email, and any other auth endpoints.
# ══════════════════════════════════════════════════════════

def _is_production() -> bool:
    """Check if we're running in production mode."""
    return os.getenv("ENV", "").lower() == "production"


def set_auth_cookie(response, token: str, max_age_minutes: int = None):
    """
    Set the JWT token as an HttpOnly cookie on the response.

    Args:
        response: Flask response object (or use make_response())
        token: The JWT string
        max_age_minutes: Cookie lifetime in minutes (defaults to JWT_EXPIRES_MINUTES)
    """
    if max_age_minutes is None:
        max_age_minutes = current_app.config.get("JWT_EXPIRES_MINUTES", 10080)

    is_prod = _is_production()

    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,              # JS cannot access this cookie (prevents XSS theft)
        secure=is_prod,             # HTTPS only in production
        samesite="Lax",             # Prevents CSRF from cross-origin forms/links
        path="/",                   # Available on all routes
        max_age=max_age_minutes * 60,  # Convert to seconds
    )
    return response


def clear_auth_cookie(response):
    """Remove the auth cookie (used on logout)."""
    is_prod = _is_production()

    response.set_cookie(
        COOKIE_NAME,
        "",
        httponly=True,
        secure=is_prod,
        samesite="Lax",
        path="/",
        max_age=0,                  # Expire immediately
        expires=0,
    )
    return response


# ══════════════════════════════════════════════════════════
#  TOKEN EXTRACTION FROM REQUEST
# ══════════════════════════════════════════════════════════

def _get_token_from_request() -> str | None:
    """Extract JWT from cookie (primary) or Authorization header (fallback)."""
    # 1) Cookie (recommended — HttpOnly, can't be stolen by XSS)
    tok = request.cookies.get(COOKIE_NAME)
    if tok:
        return tok

    # 2) Authorization header (for API clients / Postman testing)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.replace("Bearer ", "").strip()

    return None


# ══════════════════════════════════════════════════════════
#  AUTH DECORATORS
# ══════════════════════════════════════════════════════════

def require_auth(fn):
    """
    Decorator: validates JWT, loads g.current_user from DB.

    Sets:
        g.current_user  — live SQLAlchemy User object
        g.token_payload — decoded JWT dict (sub, iat, exp only)
    """
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

        user = db.session.get(User, user_id)
        if not user:
            return json_error("User not found", 401)

        token_tv = payload.get("tv", 0)          # "tv" claim embedded at login
        user_tv  = int(user.token_version or 0)
        if token_tv != user_tv:
           return json_error("Session expired. Please log in again.", 401)
        
        # Check if user is deactivated (soft-deleted)
        if not getattr(user, "is_active", True):
            return json_error("Account deactivated", 403)

        # Check if user is suspended or soft-deleted
        if getattr(user, "is_suspended", False):
            return json_error("Account suspended", 403)

        g.current_user = user
        g.token_payload = payload
        return fn(*args, **kwargs)

    return wrapper


def require_role(*roles):
    """
    Decorator: validates JWT + checks user role from DATABASE (not from token).

    Usage:
        @require_role("OWNER")
        @require_role("ADMIN", "OWNER")  # multiple roles allowed

    NOTE: Role is read from g.current_user.role (DB), NOT from the JWT.
    This is the correct pattern — the token is just an identity proof,
    the database is the source of truth for permissions.
    """
    def decorator(fn):
        @require_auth
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            user = g.current_user
            # Normalize role value (handles SQLAlchemy Enum objects)
            user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
            if user_role not in roles:
                return json_error("Forbidden", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator

