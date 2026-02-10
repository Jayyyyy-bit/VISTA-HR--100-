# app/routes/locations.py
print("✅ LOADED locations.py (with geocode)")


import json
import os
from flask import Blueprint, request, jsonify
from ..utils.errors import json_error
import requests
import time

locations_bp = Blueprint("locations", __name__)

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ncr_barangays.json")

_cache = None
_geocode_cache = {}          # q -> (ts, payload)
_GEOCODE_TTL = 60 * 30       # 30 minutes


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

    # --- tolerant city matching (Option B) ---
    keymap = {k.lower(): k for k in data.keys()}

    city_l = city.lower()
    # allow "Makati" -> "Makati City"
    if city_l not in keymap and not city_l.endswith(" city"):
        city_l2 = (city + " City").lower()
        city_l = city_l2 if city_l2 in keymap else city_l

    canonical = keymap.get(city_l)
    if not canonical:
        return json_error("Validation failed", 400, fields={"city": f"Unknown city '{city}'"})

    items = data.get(canonical) or []
    if q:
        items = [b for b in items if q in b.lower()]

    return jsonify({"city": canonical, "barangays": items[:30]}), 200

@locations_bp.get("/geocode")
def geocode():
    q = (request.args.get("q") or "").strip()
    if not q:
        return json_error("Validation failed", 400, fields={"q": "q is required"})

    # ✅ server cache (reduces Nominatim throttling)
    now = time.time()
    cached = _geocode_cache.get(q)
    if cached:
        ts, payload = cached
        if now - ts < _GEOCODE_TTL:
            return jsonify(payload), 200

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "format": "json",
        "limit": 1,
        "countrycodes": "ph",
        "q": q,
    }

    headers = {
        # IMPORTANT: use a real-ish contact
        "User-Agent": "vista-hr-local/1.0 (contact: dev@vista-hr.local)",
        "Accept-Language": "en",
    }

    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        print("NOMINATIM STATUS:", r.status_code)

        # ✅ treat throttling/block as non-fatal
        if r.status_code in (429, 403, 418):
            payload = {"hit": None, "throttled": True, "status": r.status_code}
            _geocode_cache[q] = (now, payload)
            return jsonify(payload), 200

        # Any non-200: also non-fatal (avoid 502 spam)
        if r.status_code != 200:
            print("NOMINATIM BODY:", r.text[:300])
            payload = {"hit": None, "status": r.status_code}
            _geocode_cache[q] = (now, payload)
            return jsonify(payload), 200

        data = r.json() or []
        top = data[0] if isinstance(data, list) and data else None
        if not top:
            payload = {"hit": None}
            _geocode_cache[q] = (now, payload)
            return jsonify(payload), 200

        payload = {
            "hit": {
                "lat": float(top["lat"]),
                "lng": float(top["lon"]),
                "displayName": top.get("display_name", "")
            }
        }
        _geocode_cache[q] = (now, payload)
        return jsonify(payload), 200

    except Exception as e:
        # ✅ don’t break frontend; cache the miss briefly
        print("NOMINATIM ERROR:", str(e))
        payload = {"hit": None, "error": "geocode_failed"}
        _geocode_cache[q] = (now, payload)
        return jsonify(payload), 200


