from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError
from app.schemas import GeneratedContent, GeneratedOutreach, ProviderConnectionResult


def validate_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError("Provider URL must be a valid http or https address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("Provider URL credentials are not allowed. Use the API key field instead.")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def _openai_endpoint(base_url: str, resource: str) -> str:
    normalized = validate_base_url(base_url)
    return f"{normalized}/{resource}" if normalized.endswith("/v1") else f"{normalized}/v1/{resource}"


async def _request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 25,
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(
                method, url, headers={"Accept": "application/json", **(headers or {})}, json=json_body
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(f"Provider connection failed ({type(error).__name__}).") from error
    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"Provider returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        message = ""
        if isinstance(payload, dict):
            nested = payload.get("error")
            if isinstance(nested, dict):
                message = str(nested.get("message") or "")
            message = message or str(payload.get("message") or "")
        raise ExternalServiceError(message or f"Provider returned HTTP {response.status_code}.")
    if not isinstance(payload, dict):
        raise ExternalServiceError("Provider returned an invalid JSON object.")
    return payload


async def test_provider(settings: dict[str, str]) -> ProviderConnectionResult:
    started = time.monotonic()
    try:
        if settings["kind"] == "ollama":
            payload = await _request_json(f"{validate_base_url(settings['base_url'])}/api/tags")
            raw_models = payload.get("models") if isinstance(payload.get("models"), list) else []
            models = [
                str(item.get("name")) for item in raw_models if isinstance(item, dict) and item.get("name")
            ]
            message = (
                f"Ollama connected. {len(models)} local model(s) found."
                if models
                else "Ollama connected. Pull a model to generate content."
            )
        else:
            headers = {"Authorization": f"Bearer {settings['api_key']}"} if settings["api_key"] else {}
            payload = await _request_json(_openai_endpoint(settings["base_url"], "models"), headers=headers)
            raw_models = payload.get("data") if isinstance(payload.get("data"), list) else []
            models = [
                str(item.get("id")) for item in raw_models if isinstance(item, dict) and item.get("id")
            ][:50]
            message = (
                f"Provider connected{' with ' + str(len(models)) + ' visible model(s)' if models else ''}."
            )
        return ProviderConnectionResult(
            ok=True,
            message=message,
            models=models,
            latency_ms=round((time.monotonic() - started) * 1_000),
        )
    except ExternalServiceError as error:
        return ProviderConnectionResult(
            ok=False,
            message=error.message,
            latency_ms=round((time.monotonic() - started) * 1_000),
        )


def _generation_prompt(request: dict[str, Any], workspace: dict[str, str]) -> str:
    return "\n".join(
        [
            "You are the senior social media copywriter inside a human-approved marketing workflow.",
            "Return only valid JSON with this exact shape:",
            '{"title":"short internal title","body":"publish-ready post","hashtags":["#tag"],"rationale":"one sentence explaining the angle"}',
            "Do not invent statistics, testimonials, customers, awards, prices, or guarantees.",
            "Avoid generic AI phrases, excessive punctuation, and engagement bait.",
            f"Business: {workspace['business_name'] or 'Not provided'}",
            f"Business context: {workspace['business_description'] or 'Not provided'}",
            f"Channel: {request['channel']}",
            f"Topic: {request['topic']}",
            f"Objective: {request['objective'] or 'Build useful awareness'}",
            f"Tone: {request['tone'] or 'Clear and confident'}",
            "Adapt length, structure, and hashtag count to the selected channel.",
        ]
    )


def _parse_content(value: str) -> GeneratedContent:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        cleaned = cleaned.rsplit("```", 1)[0]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ExternalServiceError("Model did not return valid JSON content.")
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise ExternalServiceError("Model did not return valid JSON content.") from error
    if not isinstance(payload, dict):
        raise ExternalServiceError("Model returned an invalid content object.")
    title = str(payload.get("title") or "").strip()[:160]
    body = str(payload.get("body") or "").strip()[:12_000]
    raw_tags = payload.get("hashtags") if isinstance(payload.get("hashtags"), list) else []
    hashtags = [str(tag).strip()[:80] for tag in raw_tags if str(tag).strip()][:20]
    rationale = str(payload.get("rationale") or "").strip()[:500]
    if not title or not body:
        raise ExternalServiceError("Model response is missing a title or body.")
    return GeneratedContent(title=title, body=body, hashtags=hashtags, rationale=rationale)


def _outreach_prompt(request: dict[str, Any], lead: dict[str, object], workspace: dict[str, str]) -> str:
    return "\n".join(
        [
            "You draft respectful business-to-business email for a human-reviewed workflow.",
            "Return only valid JSON with this exact shape:",
            '{"subject":"specific subject","body":"plain-text email","rationale":"one sentence explaining the angle"}',
            "Never claim the email was sent. Never invent facts, relationships, results, or familiarity.",
            "Do not use manipulative urgency, misleading Re: prefixes, or unsupported personalization.",
            f"Sender business: {workspace['business_name'] or 'Not provided'}",
            f"Sender context: {workspace['business_description'] or 'Not provided'}",
            f"Recipient business: {lead.get('businessName') or 'Not provided'}",
            f"Recipient website: {lead.get('website') or 'Not provided'}",
            f"Recipient location: {lead.get('location') or 'Not provided'}",
            f"Public research notes: {lead.get('notes') or 'Not provided'}",
            f"Objective: {request['objective']}",
            f"Tone: {request['tone']}",
            "Keep the message concise, transparent about the sender, and easy to decline.",
        ]
    )


def _parse_outreach(value: str) -> GeneratedOutreach:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        cleaned = cleaned.rsplit("```", 1)[0]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ExternalServiceError("Model did not return a valid outreach JSON object.")
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise ExternalServiceError("Model did not return a valid outreach JSON object.") from error
    if not isinstance(payload, dict):
        raise ExternalServiceError("Model returned an invalid outreach object.")
    subject = str(payload.get("subject") or "").strip()[:200]
    body = str(payload.get("body") or "").strip()[:12_000]
    rationale = str(payload.get("rationale") or "").strip()[:500]
    if not subject or not body:
        raise ExternalServiceError("Model response is missing an outreach subject or body.")
    return GeneratedOutreach(subject=subject, body=body, rationale=rationale)


async def _generate_json_text(
    settings: dict[str, str], prompt: str, *, system_prompt: str, temperature: float
) -> str:
    if settings["kind"] == "ollama":
        payload = await _request_json(
            f"{validate_base_url(settings['base_url'])}/api/chat",
            method="POST",
            headers={"Content-Type": "application/json"},
            json_body={
                "model": settings["model"],
                "stream": False,
                "format": "json",
                "messages": [{"role": "user", "content": prompt}],
                "options": {"temperature": temperature},
            },
            timeout=120,
        )
        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
        return str(message.get("content") or "")

    headers = {"Content-Type": "application/json"}
    if settings["api_key"]:
        headers["Authorization"] = f"Bearer {settings['api_key']}"
    payload = await _request_json(
        _openai_endpoint(settings["base_url"], "chat/completions"),
        method="POST",
        headers=headers,
        json_body={
            "model": settings["model"],
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=120,
    )
    choices = payload.get("choices") if isinstance(payload.get("choices"), list) else []
    message = choices[0].get("message") if choices and isinstance(choices[0], dict) else {}
    return str(message.get("content") or "") if isinstance(message, dict) else ""


async def generate_content(
    settings: dict[str, str], request: dict[str, Any], workspace: dict[str, str]
) -> GeneratedContent:
    if not settings["model"]:
        raise ExternalServiceError("Select a model before generating content.")
    prompt = _generation_prompt(request, workspace)
    content = await _generate_json_text(
        settings,
        prompt,
        system_prompt="You create factual, brand-safe marketing drafts for human review.",
        temperature=0.7,
    )
    return _parse_content(content)


async def generate_outreach(
    settings: dict[str, str],
    request: dict[str, Any],
    lead: dict[str, object],
    workspace: dict[str, str],
) -> GeneratedOutreach:
    if not settings["model"]:
        raise ExternalServiceError("Select a model before generating outreach.")
    content = await _generate_json_text(
        settings,
        _outreach_prompt(request, lead, workspace),
        system_prompt="You write factual outreach drafts that require explicit human approval before export.",
        temperature=0.5,
    )
    return _parse_outreach(content)
