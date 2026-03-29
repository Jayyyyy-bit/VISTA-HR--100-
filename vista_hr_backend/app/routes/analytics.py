"""
app/routes/analytics.py
-----------------------
Admin-only analytics. Simplified for capstone demo.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify
from ..auth.jwt import require_role
from ..models import User, Listing, Booking

analytics_bp = Blueprint("analytics", __name__)


def _val(v):
    return v.value if hasattr(v, "value") else str(v or "")


@analytics_bp.get("/admin/analytics")
@require_role("ADMIN")
def get_analytics():
    now = datetime.now(timezone.utc)
    thirty_ago = now - timedelta(days=30)

    users    = User.query.all()
    listings = Listing.query.all()
    bookings = Booking.query.all()

    # ── Users ──
    role_c = defaultdict(int)
    kyc_c  = defaultdict(int)
    stu_c  = defaultdict(int)
    for u in users:
        r = _val(u.role)
        role_c[r] += 1
        if r == "OWNER":    kyc_c[_val(u.kyc_status)] += 1
        if r == "RESIDENT": stu_c[_val(u.student_status)] += 1

    # ── Listings ──
    lst_status = defaultdict(int)
    lst_type   = defaultdict(int)
    city_c     = defaultdict(int)
    for l in listings:
        lst_status[l.status or "DRAFT"] += 1
        lst_type[l.place_type or "Other"] += 1
        city = ((l.location or {}).get("city") or "").strip()
        if city: city_c[city] += 1

    top_cities = sorted(city_c.items(), key=lambda x: x[1], reverse=True)[:6]

    # ── Bookings ──
    bk_status = defaultdict(int)
    revenue = 0
    for b in bookings:
        bk_status[b.status or "PENDING"] += 1
        if b.status in ("APPROVED", "ACTIVE", "COMPLETED") and b.listing:
            try: revenue += int((b.listing.capacity or {}).get("monthly_rent") or 0)
            except: pass

    # ── User growth (last 30 days) ──
    growth = defaultdict(int)
    for u in users:
        ts = u.created_at
        if not ts: continue
        if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)
        if ts >= thirty_ago:
            growth[ts.strftime("%Y-%m-%d")] += 1

    g_labels, g_values = [], []
    for i in range(29, -1, -1):
        d = now - timedelta(days=i)
        g_labels.append(d.strftime("%b %d"))
        g_values.append(growth.get(d.strftime("%Y-%m-%d"), 0))

    # ── Recent bookings ──
    recent = sorted(bookings, key=lambda b: b.created_at or datetime.min, reverse=True)[:10]
    recent_list = []
    for b in recent:
        lst = b.listing
        res = b.resident
        name = ""
        if res:
            name = f"{res.first_name or ''} {res.last_name or ''}".strip() or res.email
        recent_list.append({
            "id": b.id,
            "status": b.status,
            "listing_title": lst.title if lst else "—",
            "resident_name": name or "—",
            "move_in_date": b.move_in_date.isoformat() if b.move_in_date else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })

    return jsonify({
        "summary": {
            "total_users":        len(users),
            "total_owners":       role_c.get("OWNER", 0),
            "total_residents":    role_c.get("RESIDENT", 0),
            "published_listings": lst_status.get("PUBLISHED", 0),
            "total_listings":     len(listings),
            "total_bookings":     len(bookings),
            "pending_bookings":   bk_status.get("PENDING", 0),
            "revenue_estimate":   revenue,
        },
        "booking_funnel": {
            "labels": ["Pending","Approved","Active","Completed","Rejected","Cancelled"],
            "values": [bk_status.get(s,0) for s in ["PENDING","APPROVED","ACTIVE","COMPLETED","REJECTED","CANCELLED"]],
        },
        "verification": {
            "labels": ["KYC None","KYC Pending","KYC Approved","KYC Rejected","Stu. None","Stu. Pending","Stu. Approved","Stu. Rejected"],
            "values": [
                kyc_c.get("NONE",0), kyc_c.get("PENDING",0), kyc_c.get("APPROVED",0), kyc_c.get("REJECTED",0),
                stu_c.get("NONE",0), stu_c.get("PENDING",0), stu_c.get("APPROVED",0), stu_c.get("REJECTED",0),
            ],
        },
        "user_growth": { "labels": g_labels, "values": g_values },
        "listing_status": {
            "labels": ["Draft","Ready","Published","Archived"],
            "values": [lst_status.get(s,0) for s in ["DRAFT","READY","PUBLISHED","ARCHIVED"]],
        },
        "listing_types": {
            "labels": list(lst_type.keys()),
            "values": list(lst_type.values()),
        },
        "top_cities": {
            "labels": [c[0] for c in top_cities],
            "values": [c[1] for c in top_cities],
        },
        "recent_bookings": recent_list,
    }), 200