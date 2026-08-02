from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import func, or_, select

from app.database import read_session, write_session
from app.errors import AppError
from app.models import IcpProfile, Lead, LeadIdentity
from app.schemas import (
    IcpProfileUpdate,
    LeadImportRequest,
    LeadImportRow,
    LeadScoreOverrideUpdate,
    LeadStatusUpdate,
    LeadSuppressionUpdate,
)
from app.store import append_audit, utc_now

SOURCE_LABELS = {
    "csv": "CSV import",
    "linkedin-export": "LinkedIn export",
    "crm-export": "CRM export",
    "manual": "Manual entry",
    "website-crawl": "Public website crawl",
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
    effective_score = lead.manual_score if lead.manual_score is not None else lead.icp_score
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
        "icpScore": lead.icp_score,
        "icpReasons": list(lead.icp_reasons or []),
        "icpProfileVersion": lead.icp_profile_version,
        "icpScoredAt": lead.icp_scored_at,
        "manualScore": lead.manual_score,
        "manualScoreReason": lead.manual_score_reason,
        "manualScoreUpdatedAt": lead.manual_score_updated_at,
        "effectiveScore": effective_score,
        "createdAt": lead.created_at,
        "updatedAt": lead.updated_at,
    }


def _profile_dict(profile: IcpProfile) -> dict[str, object]:
    return {
        "id": profile.id,
        "name": profile.name,
        "targetKeywords": list(profile.target_keywords or []),
        "excludedKeywords": list(profile.excluded_keywords or []),
        "targetLocations": list(profile.target_locations or []),
        "requireWebsite": profile.require_website,
        "requireContact": profile.require_contact,
        "version": profile.version,
        "configured": profile.version > 0,
        "updatedAt": profile.updated_at,
    }


def _score_reason(code: str, label: str, points: int, detail: str) -> dict[str, object]:
    return {"code": code, "label": label, "points": points, "detail": detail}


def _score_lead(lead: Lead, profile: IcpProfile, scored_at: str) -> None:
    searchable = _normalized_text(
        " ".join(
            value
            for value in (lead.business_name, lead.website or "", lead.notes or "")
            if value
        )
    )
    location = _normalized_text(lead.location or "")
    reasons = [_score_reason("baseline", "Starting fit", 40, "Every lead starts at 40 points.")]
    score = 40

    if profile.target_keywords:
        matches = [
            term for term in profile.target_keywords if _normalized_text(term) in searchable
        ]
        if matches:
            score += 20
            reasons.append(
                _score_reason(
                    "target_keyword_match",
                    "Target keyword match",
                    20,
                    f"Matched: {', '.join(matches[:3])}.",
                )
            )
        else:
            score -= 20
            reasons.append(
                _score_reason(
                    "no_target_keyword",
                    "No target keyword",
                    -20,
                    "No target keyword appears in the business name, website, or notes.",
                )
            )

    if profile.target_locations:
        location_matches = [
            term for term in profile.target_locations if _normalized_text(term) in location
        ]
        if location_matches:
            score += 15
            reasons.append(
                _score_reason(
                    "target_location_match",
                    "Target location match",
                    15,
                    f"Matched: {', '.join(location_matches[:3])}.",
                )
            )
        else:
            score -= 15
            reasons.append(
                _score_reason(
                    "location_outside_target",
                    "Outside target locations",
                    -15,
                    "The stored location does not match the target list.",
                )
            )

    if lead.website:
        score += 10
        reasons.append(
            _score_reason("public_website", "Public website", 10, "A website is available for research.")
        )
    elif profile.require_website:
        score -= 20
        reasons.append(
            _score_reason(
                "missing_required_website",
                "Required website missing",
                -20,
                "This profile requires a public website.",
            )
        )

    if lead.email or lead.phone:
        score += 15
        channels = " and ".join(
            channel for channel, present in (("email", lead.email), ("phone", lead.phone)) if present
        )
        reasons.append(
            _score_reason(
                "direct_contact",
                "Direct contact available",
                15,
                f"Available contact: {channels}.",
            )
        )
    elif profile.require_contact:
        score -= 25
        reasons.append(
            _score_reason(
                "missing_required_contact",
                "Required contact missing",
                -25,
                "This profile requires an email address or phone number.",
            )
        )

    excluded_matches = [
        term for term in profile.excluded_keywords if _normalized_text(term) in searchable
    ]
    if excluded_matches:
        score -= 35
        reasons.append(
            _score_reason(
                "excluded_keyword_match",
                "Excluded keyword match",
                -35,
                f"Matched: {', '.join(excluded_matches[:3])}.",
            )
        )

    if score < 0:
        reasons.append(
            _score_reason("score_floor", "Score floor", -score, "Scores cannot be lower than zero.")
        )
    lead.icp_score = max(0, min(score, 100))
    lead.icp_reasons = reasons
    lead.icp_profile_version = profile.version
    lead.icp_scored_at = scored_at


def icp_profile_state() -> dict[str, object]:
    with read_session() as session:
        profile = session.get(IcpProfile, 1)
        if profile is None:
            raise RuntimeError("ICP profile storage is not initialized.")
        return _profile_dict(profile)


def save_icp_profile(payload: IcpProfileUpdate) -> dict[str, object]:
    now = utc_now()
    with write_session() as session:
        profile = session.get(IcpProfile, 1)
        if profile is None:
            raise RuntimeError("ICP profile storage is not initialized.")
        profile.name = payload.name
        profile.target_keywords = payload.target_keywords
        profile.excluded_keywords = payload.excluded_keywords
        profile.target_locations = payload.target_locations
        profile.require_website = payload.require_website
        profile.require_contact = payload.require_contact
        profile.version += 1
        profile.updated_at = now
        leads = list(session.scalars(select(Lead)).all())
        for lead in leads:
            _score_lead(lead, profile, now)
        append_audit(
            session,
            action="leads.icp_rescored",
            entity_type="icp_profile",
            entity_id=str(profile.id),
            summary=f"ICP profile v{profile.version} saved and {len(leads)} leads rescored.",
        )
        return {"profile": _profile_dict(profile), "rescored": len(leads)}


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
        profile = session.get(IcpProfile, 1)
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
                    icp_score=None,
                    icp_reasons=[],
                    icp_profile_version=None,
                    icp_scored_at=None,
                    manual_score=None,
                    manual_score_reason=None,
                    manual_score_updated_at=None,
                    created_at=now,
                    updated_at=now,
                )
                session.add(lead)
                session.flush()
                _add_missing_identities(session, lead, identities)
                if profile is not None and profile.version > 0:
                    _score_lead(lead, profile, now)
                created += 1
                continue
            if _merge_lead(lead, row, payload.source, now):
                merged += 1
            else:
                unchanged += 1
            _add_missing_identities(session, lead, identities)
            if profile is not None and profile.version > 0:
                _score_lead(lead, profile, now)
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
        if status == "high-intent":
            filters.append(func.coalesce(Lead.manual_score, Lead.icp_score) >= 70)
        elif status != "active":
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
        high_intent = int(
            session.scalar(
                select(func.count(Lead.id)).where(
                    Lead.suppressed.is_(False),
                    func.coalesce(Lead.manual_score, Lead.icp_score) >= 70,
                )
            )
            or 0
        )
    summary = {
        "total": 0,
        "active": 0,
        "suppressed": 0,
        "new": 0,
        "qualified": 0,
        "contacted": 0,
        "highIntent": high_intent,
    }
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


def update_lead_score_override(
    lead_id: str, payload: LeadScoreOverrideUpdate
) -> dict[str, object]:
    with write_session() as session:
        lead = session.get(Lead, lead_id)
        if lead is None:
            raise AppError("Lead not found.", 404)
        now = utc_now()
        lead.manual_score = payload.score
        lead.manual_score_reason = payload.reason
        lead.manual_score_updated_at = now
        lead.updated_at = now
        append_audit(
            session,
            action="lead.score_corrected",
            entity_type="lead",
            entity_id=lead.id,
            summary=f"Lead score corrected to {payload.score}: {payload.reason}",
        )
        return _lead_dict(lead)


def clear_lead_score_override(lead_id: str) -> dict[str, object]:
    with write_session() as session:
        lead = session.get(Lead, lead_id)
        if lead is None:
            raise AppError("Lead not found.", 404)
        lead.manual_score = None
        lead.manual_score_reason = None
        lead.manual_score_updated_at = None
        lead.updated_at = utc_now()
        append_audit(
            session,
            action="lead.score_correction_cleared",
            entity_type="lead",
            entity_id=lead.id,
            summary="Manual lead score correction cleared; deterministic ICP score restored.",
        )
        return _lead_dict(lead)
