import time
import os
import cloudinary
import cloudinary.utils
from flask import Blueprint, jsonify, request, g

from ..auth.jwt import require_role
from ..utils.errors import json_error

uploads_bp = Blueprint("uploads", __name__)

@uploads_bp.post("/uploads/sign")
@require_role("OWNER", "RESIDENT")
def sign_upload():
    data = request.get_json(silent=True) or {}
    user = g.current_user
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)

    # Each role gets its own folder — prevents cross-role file injection
    default_folder = "vista_hr/listings" if role_val == "OWNER" else "vista_hr/student_docs"
    folder = (data.get("folder") or default_folder).strip()

    # Residents can only upload to student_docs folder
    if role_val == "RESIDENT" and not folder.startswith("vista_hr/student_docs"):
        folder = "vista_hr/student_docs"

    timestamp = int(time.time())

    params_to_sign = {
        "timestamp": timestamp,
        "folder": folder,
    }

    signature = cloudinary.utils.api_sign_request(
        params_to_sign,
        os.getenv("CLOUDINARY_API_SECRET")
    )

    return jsonify({
        "timestamp": timestamp,
        "signature": signature,
        "cloudName": os.getenv("CLOUDINARY_CLOUD_NAME"),
        "apiKey": os.getenv("CLOUDINARY_API_KEY"),
        "folder": folder,
    }), 200