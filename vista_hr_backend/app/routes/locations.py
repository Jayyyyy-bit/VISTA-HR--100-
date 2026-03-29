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


# ---------------------------------------------------------------------------
# City bounding boxes (min_lon, min_lat, max_lon, max_lat) for NCR cities.
# Used as Nominatim viewbox to prevent cross-city mismatch.
# Caloocan is the critical one — North and South are geographically far apart
# and Nominatim defaults to South Caloocan without a bbox constraint.
# ---------------------------------------------------------------------------
_CITY_BBOX = {
    "caloocan city": (120.9600, 14.6800, 121.0200, 14.8000),  # full Caloocan (N+S)
    "quezon city":   (121.0100, 14.5900, 121.1300, 14.7800),
    "manila":        (120.9600, 14.5600, 121.0100, 14.6200),
    "makati city":   (121.0100, 14.5300, 121.0600, 14.5800),
    "pasig city":    (121.0500, 14.5400, 121.1000, 14.6000),
    "taguig city":   (121.0300, 14.4600, 121.1200, 14.5600),
    "mandaluyong city": (121.0200, 14.5700, 121.0500, 14.6000),
    "marikina city": (121.0800, 14.6100, 121.1400, 14.6800),
    "pasay city":    (120.9900, 14.5300, 121.0000, 14.5600),
    "las piñas city": (120.9700, 14.4200, 121.0100, 14.4900),
    "paranaque city": (121.0000, 14.4700, 121.0700, 14.5200),
    "muntinlupa city": (121.0100, 14.3800, 121.1000, 14.4600),
    "valenzuela city": (120.9500, 14.6800, 121.0100, 14.7600),
    "malabon city":  (120.9500, 14.6500, 120.9900, 14.7000),
    "navotas city":  (120.9400, 14.6500, 120.9700, 14.7100),
    "san juan city": (121.0200, 14.5900, 121.0600, 14.6200),
    "pateros":       (121.0600, 14.5500, 121.0900, 14.5800),
}

# North Caloocan barangays that must be constrained to the northern bbox.
# Without this, Nominatim places them in South Caloocan.
_NORTH_CALOOCAN_BRGY = {
    "bagong barrio", "bagumbong", "camarin", "deparo",
    "grace park east", "grace park west", "kaybiga", "llano",
    "maypajo", "pangarap", "sangandaan", "tala", "biglang-awa",
}
_NORTH_CALOOCAN_BBOX = (120.9700, 14.7200, 121.0200, 14.8000)
_SOUTH_CALOOCAN_BBOX = (120.9600, 14.6800, 121.0000, 14.7400)


def _get_bbox_for_query(q_lower):
    """
    Return (min_lon, min_lat, max_lon, max_lat) if we can identify the city
    from the query string, otherwise None.
    For Caloocan, further narrow to North or South based on barangay name.
    """
    for city_key, bbox in _CITY_BBOX.items():
        if city_key in q_lower:
            # Extra precision for Caloocan: check if any North barangay is in query
            if city_key == "caloocan city":
                for brgy in _NORTH_CALOOCAN_BRGY:
                    if brgy in q_lower:
                        return _NORTH_CALOOCAN_BBOX
                # Default to South Caloocan bbox if no North barangay detected
                return _SOUTH_CALOOCAN_BBOX
            return bbox
    return None


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

    # Build params — add viewbox+bounded if we can identify the city
    # to prevent Nominatim from returning results in the wrong area.
    bbox = _get_bbox_for_query(q.lower())
    params = {
        "format": "json",
        "limit": 1,
        "countrycodes": "ph",
        "q": q,
    }
    if bbox:
        # viewbox biases results toward this area WITHOUT bounded=1.
        # bounded=1 is a hard filter — if Nominatim doesn't have the exact
        # barangay indexed inside the box, it returns nothing.
        # Without bounded, viewbox is a soft priority hint: results inside
        # the box rank higher, but Nominatim still falls back to nearby results.
        # viewbox format: left,top,right,bottom = min_lon,max_lat,max_lon,min_lat
        params["viewbox"] = f"{bbox[0]},{bbox[3]},{bbox[2]},{bbox[1]}"

    headers = {
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

        # If viewbox-biased search returned nothing, retry without viewbox.
        # This is the fallback for barangays Nominatim doesn't have precisely
        # indexed — we still get a usable city-level or nearby result.
        if not top and "viewbox" in params:
            params_fallback = {k: v for k, v in params.items() if k != "viewbox"}
            r2 = requests.get(url, params=params_fallback, headers=headers, timeout=10)
            if r2.status_code == 200:
                data2 = r2.json() or []
                top = data2[0] if isinstance(data2, list) and data2 else None
                print("[Step3] viewbox miss — fallback result:", top.get("display_name", "")[:80] if top else "none")

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



@locations_bp.post("/geocode/clear-cache")
def clear_geocode_cache():
    """Dev utility: wipe in-memory geocode cache so stale wrong pins are re-fetched."""
    _geocode_cache.clear()
    return jsonify({"cleared": True}), 200