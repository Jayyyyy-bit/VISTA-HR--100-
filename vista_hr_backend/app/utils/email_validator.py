"""
app/utils/email_validator.py
-----------------------------
Validates email via Abstract API (free tier: 100/day).
Falls back to regex-only if API key not set or request fails.

.env key needed:
    ABSTRACT_API_KEY=your_key_here
"""

import os
import re
import requests

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Hardcoded fallback blocklist — catches the obvious junk
_BLOCKED_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "tempmail.com", "throwam.com",
    "yopmail.com", "sharklasers.com", "trashmail.com", "tite.com",
    "getnada.com", "fakeinbox.com", "dispostable.com", "maildrop.cc", "pepe.com", "gago.com", "boobs.com", "guerrillamailblock.com", "grr.la", "spam4.me",
    }


def validate_email(email: str) -> tuple[bool, str]:
    """
    Returns (is_valid: bool, reason: str).
    reason is empty string on success.
    """
    email = email.strip().lower()

    if not _EMAIL_RE.match(email):
        return False, "Invalid email format."

    domain = email.split("@")[1]
    if domain in _BLOCKED_DOMAINS:
        return False, "Disposable email addresses are not allowed."

    api_key = os.getenv("ABSTRACT_API_KEY", "")
    if not api_key:
        # No API key — regex + blocklist only
        return True, ""

    try:
        resp = requests.get(
            "https://emailvalidation.abstractapi.com/v1/",
            params={"api_key": api_key, "email": email},
            timeout=4,
        )
        data = resp.json()

        if data.get("is_disposable_email", {}).get("value"):
            return False, "Disposable email addresses are not allowed."

        if data.get("deliverability") == "UNDELIVERABLE":
            return False, "Email address is undeliverable."

        if not data.get("is_valid_format", {}).get("value"):
            return False, "Invalid email format."

    except Exception:
        # API unreachable — fail open, don't block registration
        pass

    return True, ""