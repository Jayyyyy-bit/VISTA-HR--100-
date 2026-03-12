import time
import os
import cloudinary
import cloudinary.utils
from flask import Blueprint, jsonify, request, g

from ..auth.jwt import require_role
from ..utils.errors import json_error

uploads_bp = Blueprint("uploads", __name__)

@uploads_bp.post("/uploads/sign")
@require_role("OWNER")
def sign_upload():
    data = request.get_json(silent=True) or {}
    folder = (data.get("folder") or "vista_hr/listings").strip()

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
