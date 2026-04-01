# app/routes/locations.py
print(" locations(PSGC API + Nominatim geocode) loaded")

import time
from flask import Blueprint, request, jsonify
from ..utils.errors import json_error
import requests

locations_bp = Blueprint("locations", __name__)

# ---------------------------------------------------------------------------
# PSGC API — Philippine Standard Geographic Code
# Official government REST API. No API key required. Free.
# Docs: https://psgc.gitlab.io/api/
# NCR region code: 130000000
# ---------------------------------------------------------------------------
_PSGC_BASE        = "https://psgc.gitlab.io/api"
_PSGC_NCR_CODE    = "130000000"
_PSGC_HEADERS     = {"Accept": "application/json"}
_PSGC_TIMEOUT     = 15  # seconds

# ---------------------------------------------------------------------------
# In-memory cache for PSGC data.
# Cities list and per-city barangay lists are cached with a 24-hour TTL.
# PSGC data changes at most a few times per decade — long TTL is safe.
# ---------------------------------------------------------------------------
_CITIES_CACHE: dict = {}          # { "data": [...], "ts": float } | {}
_BARANGAY_CACHE: dict = {}        # { city_code: { "data": [...], "ts": float } }
_PSGC_TTL = 60 * 60 * 24         # 24 hours


def _psgc_fetch(path: str) -> list:
    """
    GET a PSGC API path and return the parsed JSON list.
    Raises requests.RequestException on network failure.
    Raises ValueError if the response is not a list.
    """
    url = f"{_PSGC_BASE}{path}"
    r = requests.get(url, headers=_PSGC_HEADERS, timeout=_PSGC_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise ValueError(f"PSGC returned unexpected shape for {path}")
    return data


def _get_ncr_cities() -> list[dict]:
    """
    Return NCR cities/municipalities from PSGC, with 24h cache.
    Each item: { "code": str, "name": str }
    Sorted alphabetically by name.
    """
    now = time.time()
    cached = _CITIES_CACHE.get("data")
    if cached and (now - _CITIES_CACHE.get("ts", 0)) < _PSGC_TTL:
        return cached

    raw = _psgc_fetch(f"/regions/{_PSGC_NCR_CODE}/cities-municipalities/")

    # Normalize: PSGC names are uppercase (e.g. "QUEZON CITY") — title-case them
    cities = sorted(
        [{"code": item["code"], "name": item["name"].title()} for item in raw],
        key=lambda x: x["name"]
    )

    _CITIES_CACHE["data"] = cities
    _CITIES_CACHE["ts"] = now
    return cities


def _get_barangays_for_city(city_code: str) -> list[str]:
    """
    Return barangay names for a given PSGC city code, with 24h cache.
    Returns a sorted list of strings.
    """
    now = time.time()
    cached = _BARANGAY_CACHE.get(city_code)
    if cached and (now - cached.get("ts", 0)) < _PSGC_TTL:
        return cached["data"]

    raw = _psgc_fetch(f"/cities-municipalities/{city_code}/barangays/")

    barangays = sorted([item["name"].title() for item in raw])

    _BARANGAY_CACHE[city_code] = {"data": barangays, "ts": now}
    return barangays


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@locations_bp.get("/locations/cities")
def get_cities():
    """
    GET /api/locations/cities
    Returns all NCR cities/municipalities from the PSGC API.
    Response: { "cities": ["Caloocan", "Las Piñas", ...], "source": "psgc" }
    """
    try:
        cities = _get_ncr_cities()
        return jsonify({
            "cities": [c["name"] for c in cities],
            "source": "psgc"
        }), 200

    except requests.RequestException as e:
        print(f"[PSGC] cities fetch failed: {e}")
        return json_error("Location service unavailable. Please try again later.", 503)

    except Exception as e:
        print(f"[PSGC] cities unexpected error: {e}")
        return json_error("Failed to load cities.", 500)


@locations_bp.get("/locations/barangays")
def get_barangays():
    """
    GET /api/locations/barangays?city=<name>&q=<search>
    Returns barangays for the given NCR city from the PSGC API.
    - city: required, matched tolerantly (e.g. "Makati" → "Makati City")
    - q: optional search filter (substring match, case-insensitive)
    Response: { "city": str, "barangays": [...], "source": "psgc" }
    """
    city_param = (request.args.get("city") or "").strip()
    q = (request.args.get("q") or "").strip().lower()

    if not city_param:
        return json_error("Validation failed", 400, fields={"city": "city is required"})

    # --- resolve city_param to a PSGC city entry ---
    try:
        cities = _get_ncr_cities()
    except requests.RequestException as e:
        print(f"[PSGC] cities fetch failed during barangay lookup: {e}")
        return json_error("Location service unavailable. Please try again later.", 503)
    except Exception as e:
        print(f"[PSGC] unexpected error during city load: {e}")
        return json_error("Failed to load cities.", 500)

    # Tolerant matching: build a lowercase name → city dict
    # Also allow "Makati" to match "Makati City"
    namemap = {c["name"].lower(): c for c in cities}

    city_l = city_param.lower()
    matched = namemap.get(city_l)

    # Fallback: try appending " City" (e.g. "Makati" → "Makati City")
    if not matched and not city_l.endswith(" city"):
        matched = namemap.get(city_l + " city")

    # Fallback: try stripping " City" (e.g. "Manila City" → "Manila")
    if not matched and city_l.endswith(" city"):
        matched = namemap.get(city_l.removesuffix(" city").strip())

    if not matched:
        return json_error(
            "Validation failed", 400,
            fields={"city": f"Unknown city '{city_param}'"}
        )

    # --- fetch barangays ---
    try:
        barangays = _get_barangays_for_city(matched["code"])
    except requests.RequestException as e:
        print(f"[PSGC] barangays fetch failed for {matched['code']}: {e}")
        return json_error("Location service unavailable. Please try again later.", 503)
    except Exception as e:
        print(f"[PSGC] unexpected error fetching barangays: {e}")
        return json_error("Failed to load barangays.", 500)

    # Optional search filter
    if q:
        barangays = [b for b in barangays if q in b.lower()]

    return jsonify({
        "city": matched["name"],
        "barangays": barangays[:50],
        "source": "psgc"
    }), 200


# ---------------------------------------------------------------------------
# Geocode — Nominatim (OpenStreetMap). Unchanged from original.
# Already a real external API — no modification needed.
# ---------------------------------------------------------------------------

_geocode_cache: dict = {}       # q -> (ts, payload)
_GEOCODE_TTL = 60 * 30          # 30 minutes

_CITY_BBOX = {
    "caloocan city":      (120.9600, 14.6800, 121.0200, 14.8000),
    "quezon city":        (121.0100, 14.5900, 121.1300, 14.7800),
    "manila":             (120.9600, 14.5600, 121.0100, 14.6200),
    "makati city":        (121.0100, 14.5300, 121.0600, 14.5800),
    "pasig city":         (121.0500, 14.5400, 121.1000, 14.6000),
    "taguig city":        (121.0300, 14.4600, 121.1200, 14.5600),
    "mandaluyong city":   (121.0200, 14.5700, 121.0500, 14.6000),
    "marikina city":      (121.0800, 14.6100, 121.1400, 14.6800),
    "pasay city":         (120.9900, 14.5300, 121.0000, 14.5600),
    "las piñas city":     (120.9700, 14.4200, 121.0100, 14.4900),
    "paranaque city":     (121.0000, 14.4700, 121.0700, 14.5200),
    "muntinlupa city":    (121.0100, 14.3800, 121.1000, 14.4600),
    "valenzuela city":    (120.9500, 14.6800, 121.0100, 14.7600),
    "malabon city":       (120.9500, 14.6500, 120.9900, 14.7000),
    "navotas city":       (120.9400, 14.6500, 120.9700, 14.7100),
    "san juan city":      (121.0200, 14.5900, 121.0600, 14.6200),
    "pateros":            (121.0600, 14.5500, 121.0900, 14.5800),
}

_NORTH_CALOOCAN_BRGY = {
    "bagong barrio", "bagumbong", "camarin", "deparo",
    "grace park east", "grace park west", "kaybiga", "llano",
    "maypajo", "pangarap", "sangandaan", "tala", "biglang-awa",
}
_NORTH_CALOOCAN_BBOX = (120.9700, 14.7200, 121.0200, 14.8000)
_SOUTH_CALOOCAN_BBOX = (120.9600, 14.6800, 121.0000, 14.7400)


def _get_bbox_for_query(q_lower: str):
    for city_key, bbox in _CITY_BBOX.items():
        if city_key in q_lower:
            if city_key == "caloocan city":
                for brgy in _NORTH_CALOOCAN_BRGY:
                    if brgy in q_lower:
                        return _NORTH_CALOOCAN_BBOX
                return _SOUTH_CALOOCAN_BBOX
            return bbox
    return None


@locations_bp.get("/geocode")
def geocode():
    """
    GET /api/geocode?q=<address string>
    Geocodes an address string via Nominatim (OpenStreetMap). Free, no key needed.
    Server-side cached for 30 minutes per unique query string.
    Response: { "hit": { "lat": float, "lng": float, "displayName": str } | null }
    """
    q = (request.args.get("q") or "").strip()
    if not q:
        return json_error("Validation failed", 400, fields={"q": "q is required"})

    now = time.time()
    cached = _geocode_cache.get(q)
    if cached:
        ts, payload = cached
        if now - ts < _GEOCODE_TTL:
            return jsonify(payload), 200

    url = "https://nominatim.openstreetmap.org/search"
    bbox = _get_bbox_for_query(q.lower())
    params = {
        "format": "json",
        "limit": 1,
        "countrycodes": "ph",
        "q": q,
    }
    if bbox:
        # viewbox = soft bias (not hard filter) so Nominatim still falls back
        # if barangay isn't precisely indexed inside the box.
        # format: left,top,right,bottom = min_lon,max_lat,max_lon,min_lat
        params["viewbox"] = f"{bbox[0]},{bbox[3]},{bbox[2]},{bbox[1]}"

    headers = {
        "User-Agent": "vista-hr/1.0 (contact: dev@vista-hr.local)",
        "Accept-Language": "en",
    }

    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        print("NOMINATIM STATUS:", r.status_code)

        if r.status_code in (429, 403, 418):
            payload = {"hit": None, "throttled": True, "status": r.status_code}
            _geocode_cache[q] = (now, payload)
            return jsonify(payload), 200

        if r.status_code != 200:
            print("NOMINATIM BODY:", r.text[:300])
            payload = {"hit": None, "status": r.status_code}
            _geocode_cache[q] = (now, payload)
            return jsonify(payload), 200

        data = r.json() or []
        top = data[0] if isinstance(data, list) and data else None

        # Viewbox miss — retry without viewbox for city-level fallback
        if not top and "viewbox" in params:
            params_fallback = {k: v for k, v in params.items() if k != "viewbox"}
            r2 = requests.get(url, params=params_fallback, headers=headers, timeout=10)
            if r2.status_code == 200:
                data2 = r2.json() or []
                top = data2[0] if isinstance(data2, list) and data2 else None
                print("[geocode] viewbox miss — fallback:", top.get("display_name", "")[:80] if top else "none")

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
        print("NOMINATIM ERROR:", str(e))
        payload = {"hit": None, "error": "geocode_failed"}
        _geocode_cache[q] = (now, payload)
        return jsonify(payload), 200


@locations_bp.post("/geocode/clear-cache")
def clear_geocode_cache():
    """Dev utility — wipe geocode cache."""
    _geocode_cache.clear()
    return jsonify({"cleared": True}), 200


@locations_bp.post("/locations/clear-cache")
def clear_psgc_cache():
    """Dev utility — wipe PSGC cities/barangays cache to force a fresh fetch."""
    _CITIES_CACHE.clear()
    _BARANGAY_CACHE.clear()
    return jsonify({"cleared": True}), 200