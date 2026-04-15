import time
import os
import cloudinary
import cloudinary.utils
from flask import Blueprint, jsonify, request, g

from ..auth.jwt import require_auth
from ..utils.errors import json_error

uploads_bp = Blueprint("uploads", __name__)

# Folders each role is permitted to upload to
_ALLOWED_FOLDERS = {
    "OWNER":    {"vista_hr/listings", "vista_hr/kyc", "vista_hr/avatars"},
    "RESIDENT": {"vista_hr/kyc", "vista_hr/student_docs", "vista_hr/avatars", "vista_hr/payment_proofs"},
    "ADMIN":    {"vista_hr/avatars"},
}

_DEFAULT_FOLDER = {
    "OWNER":    "vista_hr/listings",
    "RESIDENT": "vista_hr/kyc",
    "ADMIN":    "vista_hr/avatars",
}


@uploads_bp.post("/uploads/sign")
@require_auth                        # any authenticated role — ADMIN can upload avatar
def sign_upload():
    data     = request.get_json(silent=True) or {}
    user     = g.current_user
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)

    allowed = _ALLOWED_FOLDERS.get(role_val)
    if not allowed:
        return json_error("Upload not permitted for this role.", 403)

    folder = (data.get("folder") or "").strip() or _DEFAULT_FOLDER.get(role_val, "")
    if not folder:
        return json_error("No upload folder configured for this role.", 400)

    if folder not in allowed:
        return json_error(
            f"Folder '{folder}' is not permitted. Allowed: {', '.join(sorted(allowed))}",
            403,
        )

    timestamp = int(time.time())
    signature = cloudinary.utils.api_sign_request(
        {"timestamp": timestamp, "folder": folder},
        os.getenv("CLOUDINARY_API_SECRET"),
    )

    return jsonify({
        "timestamp": timestamp,
        "signature": signature,
        "cloudName": os.getenv("CLOUDINARY_CLOUD_NAME"),
        "apiKey":    os.getenv("CLOUDINARY_API_KEY"),
        "folder":    folder,
    }), 200