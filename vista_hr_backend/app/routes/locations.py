import json
import os
from flask import Blueprint, request, jsonify
from ..utils.errors import json_error

locations_bp = Blueprint("locations", __name__)

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ncr_barangays.json")

_cache = None

def _load_data():
    global _cache
    if _cache is not None:
        return _cache

    if not os.path.exists(DATA_PATH):
        _cache = {}
        return _cache

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        _cache = json.load(f) or {}
    return _cache


@locations_bp.get("/locations/cities")
def get_cities():
    data = _load_data()
    cities = sorted(list(data.keys()))
    return jsonify({"cities": cities}), 200


@locations_bp.get("/locations/barangays")
def get_barangays():
    city = (request.args.get("city") or "").strip()
    q = (request.args.get("q") or "").strip().lower()

    if not city:
        return json_error("Validation failed", 400, fields={"city": "city is required"})

    data = _load_data()
    if city not in data:
        return json_error("Validation failed", 400, fields={"city": f"Unknown city '{city}'"})

    items = data[city] or []
    if q:
        items = [b for b in items if q in b.lower()]

    return jsonify({"city": city, "barangays": items[:30]}), 200
