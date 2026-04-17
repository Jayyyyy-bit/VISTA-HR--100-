from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models.ticket import Ticket
from ..models.user import User
from ..auth.jwt import require_auth, require_role
from ..utils.errors import json_error
from ..routes.notifications import create_notification

tickets_bp = Blueprint("tickets", __name__)


# ── User endpoints ───────────────────────────────────────────────

@tickets_bp.post("/tickets")
@require_auth
def create_ticket():
    """Any authenticated user can submit a ticket."""
    data = request.get_json(silent=True) or {}
    user = g.current_user

    subject  = (data.get("subject")  or "").strip()
    body     = (data.get("body")     or "").strip()
    category = (data.get("category") or "OTHER").strip().upper()

    if not subject or not body:
        return json_error("Subject and description are required.", 400)
    if len(subject) > 200:
        return json_error("Subject must be under 200 characters.", 400)
    if len(body) > 5000:
        return json_error("Description must be under 5000 characters.", 400)

    valid_categories = ("TECHNICAL", "BILLING", "LISTING", "ACCOUNT", "OTHER")
    if category not in valid_categories:
        category = "OTHER"

    ticket = Ticket(
        user_id=user.id,
        subject=subject,
        body=body,
        category=category,
    )

    try:
        db.session.add(ticket)
        db.session.commit()
        return jsonify({"message": "Ticket submitted.", "ticket": ticket.to_dict()}), 201
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)


@tickets_bp.get("/tickets")
@require_auth
def list_own_tickets():
    """List the current user's own tickets, newest first."""
    user = g.current_user
    tickets = (
        Ticket.query
        .filter_by(user_id=user.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return jsonify({"tickets": [t.to_dict() for t in tickets]}), 200


@tickets_bp.get("/tickets/<int:ticket_id>")
@require_auth
def get_ticket(ticket_id):
    """Get a single ticket — user can only see their own; admin can see all."""
    user = g.current_user
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return json_error("Ticket not found.", 404)

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if ticket.user_id != user.id and role_val != "ADMIN":
        return json_error("Forbidden.", 403)

    return jsonify({"ticket": ticket.to_dict()}), 200


# ── Admin endpoints ──────────────────────────────────────────────

@tickets_bp.get("/admin/tickets")
@require_role("ADMIN")
def admin_list_tickets():
    """Admin sees all tickets with optional ?status=, ?category=, ?role= filters."""
    query = Ticket.query

    status   = request.args.get("status",   "").strip().upper()
    category = request.args.get("category", "").strip().upper()
    role     = request.args.get("role",     "").strip().upper()

    if status and status in ("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"):
        query = query.filter(Ticket.status == status)
    if category and category in ("TECHNICAL", "BILLING", "LISTING", "ACCOUNT", "OTHER"):
        query = query.filter(Ticket.category == category)
    tickets = query.order_by(Ticket.created_at.desc()).all()

    result = []
    for t in tickets:
        td = t.to_dict()
        submitter = db.session.get(User, t.user_id)
        if submitter:
            first = (submitter.first_name or "").strip()
            last  = (submitter.last_name  or "").strip()
            td["user_name"]   = f"{first} {last}".strip() or submitter.email
            td["user_email"]  = submitter.email
            td["user_role"]   = submitter.role.value if hasattr(submitter.role, "value") else str(submitter.role)
            td["user_avatar"] = getattr(submitter, "avatar_url", None)
        result.append(td)

    return jsonify({"tickets": result}), 200


@tickets_bp.patch("/admin/tickets/<int:ticket_id>")
@require_role("ADMIN")
def admin_update_ticket(ticket_id):
    """Admin replies and/or changes ticket status."""
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return json_error("Ticket not found.", 404)

    data = request.get_json(silent=True) or {}

    reply      = (data.get("admin_reply") or "").strip()
    new_status = (data.get("status")      or "").strip().upper()

    if not reply and not new_status:
        return json_error("Provide admin_reply and/or status.", 400)

    valid_statuses = ("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
    if new_status and new_status not in valid_statuses:
        return json_error(f"Invalid status. Must be one of: {', '.join(valid_statuses)}", 400)

    if reply:
        ticket.admin_reply = reply
        ticket.replied_at  = datetime.now(timezone.utc)

    if new_status:
        ticket.status = new_status

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return json_error("Database error.", 500)

    # Notify AFTER commit — read status from committed state
    status_val = ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status)
    notif_body = f"Status: {status_val}"
    if reply:
        notif_body += f" — {reply[:100]}"

    create_notification(
        user_id=ticket.user_id,
        notif_type="TICKET",
        title=f"Update on your ticket: {ticket.subject[:60]}",
        body=notif_body,
    )

    return jsonify({"message": "Ticket updated.", "ticket": ticket.to_dict()}), 200