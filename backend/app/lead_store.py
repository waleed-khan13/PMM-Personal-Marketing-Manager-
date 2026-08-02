from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import func, or_, select

from app.database import read_session, write_session
from app.errors import AppError
from app.models import Lead, LeadIdentity
from app.schemas import LeadImportRequest, LeadImportRow, LeadStatusUpdate, LeadSuppressionUpdate
from app.store import append_audit, utc_now

SOURCE_LABELS = {
    "csv": "CSV import",
    "linkedin-export": "LinkedIn export",
    "crm-export": "CRM export",
    "manual": "Manual entry",
}


def _normalized_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join("".join(character if character.isalnum() else " " for character in normalized).split())


def _normalized_email(value: str) -> str:
    return value.strip().casefold()


def _normalized_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    return digits if len(digits) >= 7 else ""


def _normalized_domain(value: str) -> str:
    raw = value.strip()
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw if "://" in raw else f"//{raw}")
        host = (parsed.hostname or "").strip(".").casefold()
    except ValueError:
        return ""
    host = host.removeprefix("www.")
    return host


def _identity_values(row: LeadImportRow) -> list[tuple[str, str]]:
    identities: list[tuple[str, str]] = []
    email = _normalized_email(row.email)
    domain = _normalized_domain(row.website)
    phone = _normalized_phone(row.phone)
    name = _normalized_text(row.business_name)
    location = _normalized_text(row.location)
    if email:
        identities.append(("email", email))
    if domain:
        identities.append(("domain", domain))
    if phone:
        identities.append(("phone", phone))
    if name:
        identities.append(("name-location", f"{name}|{location}"))
    return identities


def _lead_dict(lead: Lead) -> dict[str, object]:
    return {
        "id": lead.id,
        "businessName": lead.business_name,
        "website": lead.website,
        "email": lead.email,
        "phone": lead.phone,
        "location": lead.location,
        "source": lead.source,
        "sourceLabel": SOURCE_LABELS.get(lead.source, lead.source.replace("-", " ").title()),
        "sourceRef": lead.source_ref,
        "notes": lead.notes,
        "evidence": list(lead.evidence or []),
        "status": lead.status,
        "suppressed": lead.suppressed,
        "suppressionReason": lead.suppression_reason,
        "suppressedAt": lead.suppressed_at,
        "createdAt": lead.created_at,
        "updatedAt": lead.updated_at,
    }


def _find_existing_lead(session, identities: Iterable[tuple[str, str]]) -> Lead | None:  # type: ignore[no-untyped-def]
    clauses = [
        (LeadIdentity.kind == kind) & (LeadIdentity.value == value)
        for kind, value in identities
    ]
    if not clauses:
        return None
    identity = session.scalar(select(LeadIdentity).where(or_(*clauses)).order_by(LeadIdentity.id.asc()))
    return session.get(Lead, identity.lead_id) if identity is not None else None


def _add_missing_identities(
    session, lead: Lead, identities: Iterable[tuple[str, str]]  # type: ignore[no-untyped-def]
) -> None:
    for kind, value in identities:
        existing = session.scalar(
            select(LeadIdentity.id).where(LeadIdentity.kind == kind, LeadIdentity.value == value)
        )
        if existing is None:
            session.add(LeadIdentity(lead_id=lead.id, kind=kind, value=value))
    session.flush()


def _evidence(source: str, row: LeadImportRow, imported_at: str) -> dict[str, str]:
    evidence = {"source": source, "sourceLabel": SOURCE_LABELS[source], "importedAt": imported_at}
    if row.source_ref:
        evidence["sourceRef"] = row.source_ref
    return evidence


def _merge_lead(lead: Lead, row: LeadImportRow, source: str, imported_at: str) -> bool:
    changed = False
    updates = {
        "business_name": row.business_name,
        "website": row.website,
        "email": row.email,
        "phone": row.phone,
        "location": row.location,
        "source_ref": row.source_ref,
        "notes": row.notes,
    }
    for field, value in updates.items():
        if value and not getattr(lead, field):
            setattr(lead, field, value)
            changed = True
    evidence = list(lead.evidence or [])
    item = _evidence(source, row, imported_at)
    duplicate = any(
        entry.get("source") == item["source"] and entry.get("sourceRef") == item.get("sourceRef")
        for entry in evidence
    )
    if not duplicate:
        evidence.append(item)
        lead.evidence = evidence[-50:]
        changed = True
    if changed:
        lead.updated_at = imported_at
    return changed


def import_leads(payload: LeadImportRequest) -> dict[str, int]:
    created = 0
    merged = 0
    unchanged = 0
    suppressed = 0
    now = utc_now()
    with write_session() as session:
        for row in payload.rows:
            identities = _identity_values(row)
            lead = _find_existing_lead(session, identities)
            if lead is not None and lead.suppressed:
                suppressed += 1
                continue
            if lead is None:
                lead = Lead(
                    id=str(uuid4()),
                    business_name=row.business_name,
                    website=row.website or None,
                    email=row.email or None,
                    phone=row.phone or None,
                    location=row.location or None,
                    source=payload.source,
                    source_ref=row.source_ref or None,
                    notes=row.notes,
                    evidence=[_evidence(payload.source, row, now)],
                    status="new",
                    suppressed=False,
                    suppression_reason=None,
                    suppressed_at=None,
                    created_at=now,
                    updated_at=now,
                )
                session.add(lead)
                session.flush()
                _add_missing_identities(session, lead, identities)
                created += 1
                continue
            if _merge_lead(lead, row, payload.source, now):
                merged += 1
            else:
                unchanged += 1
            _add_missing_identities(session, lead, identities)
        append_audit(
            session,
            action="leads.imported",
            entity_type="lead",
            entity_id=payload.source,
            summary=(
                f"{len(payload.rows)} leads processed from {SOURCE_LABELS[payload.source]}: "
                f"{created} created, {merged} merged, {suppressed} suppressed."
            ),
        )
    return {
        "processed": len(payload.rows),
        "created": created,
        "merged": merged,
        "unchanged": unchanged,
        "suppressed": suppressed,
    }


def list_leads(
    *, query: str = "", status: str = "active", limit: int = 200, offset: int = 0
) -> dict[str, object]:
    filters = []
    if status == "suppressed":
        filters.append(Lead.suppressed.is_(True))
    else:
        filters.append(Lead.suppressed.is_(False))
        if status != "active":
            filters.append(Lead.status == status)
    if query.strip():
        pattern = f"%{query.strip()}%"
        filters.append(
            or_(
                Lead.business_name.ilike(pattern),
                Lead.website.ilike(pattern),
                Lead.email.ilike(pattern),
                Lead.phone.ilike(pattern),
                Lead.location.ilike(pattern),
            )
        )
    with read_session() as session:
        total = int(session.scalar(select(func.count(Lead.id)).where(*filters)) or 0)
        leads = list(
            session.scalars(
                select(Lead)
                .where(*filters)
                .order_by(Lead.updated_at.desc(), Lead.created_at.desc())
                .offset(offset)
                .limit(limit)
            ).all()
        )
    return {"items": [_lead_dict(lead) for lead in leads], "total": total, "limit": limit, "offset": offset}


def lead_summary() -> dict[str, int]:
    with read_session() as session:
        rows = session.execute(
            select(Lead.status, Lead.suppressed, func.count(Lead.id)).group_by(Lead.status, Lead.suppressed)
        ).all()
    summary = {"total": 0, "active": 0, "suppressed": 0, "new": 0, "qualified": 0, "contacted": 0}
    for status, is_suppressed, count in rows:
        amount = int(count)
        summary["total"] += amount
        if is_suppressed:
            summary["suppressed"] += amount
        else:
            summary["active"] += amount
            if status in summary:
                summary[status] += amount
    return summary


def update_lead_status(lead_id: str, payload: LeadStatusUpdate) -> dict[str, object]:
    with write_session() as session:
        lead = session.get(Lead, lead_id)
        if lead is None:
            raise AppError("Lead not found.", 404)
        if lead.suppressed:
            raise AppError("Restore this lead before changing its pipeline status.")
        lead.status = payload.status
        lead.updated_at = utc_now()
        append_audit(
            session,
            action="lead.status_changed",
            entity_type="lead",
            entity_id=lead.id,
            summary=f"Lead status changed to {payload.status}.",
        )
        return _lead_dict(lead)


def suppress_lead(lead_id: str, payload: LeadSuppressionUpdate) -> dict[str, object]:
    with write_session() as session:
        lead = session.get(Lead, lead_id)
        if lead is None:
            raise AppError("Lead not found.", 404)
        now = utc_now()
        lead.suppressed = True
        lead.suppression_reason = payload.reason
        lead.suppressed_at = now
        lead.updated_at = now
        append_audit(
            session,
            action="lead.suppressed",
            entity_type="lead",
            entity_id=lead.id,
            summary=f"Lead suppressed: {payload.reason}",
        )
        return _lead_dict(lead)


def restore_lead(lead_id: str) -> dict[str, object]:
    with write_session() as session:
        lead = session.get(Lead, lead_id)
        if lead is None:
            raise AppError("Lead not found.", 404)
        lead.suppressed = False
        lead.suppression_reason = None
        lead.suppressed_at = None
        lead.updated_at = utc_now()
        append_audit(
            session,
            action="lead.restored",
            entity_type="lead",
            entity_id=lead.id,
            summary="Lead restored to the active local database.",
        )
        return _lead_dict(lead)
