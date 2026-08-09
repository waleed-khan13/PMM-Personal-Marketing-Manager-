from __future__ import annotations

import os
import re
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError

DEFAULT_WHATSAPP_GRAPH_BASE_URL = "https://graph.facebook.com"
DEFAULT_WHATSAPP_GRAPH_VERSION = "v25.0"
_API_VERSION_PATTERN = re.compile(r"v\d+\.\d+")
_PHONE_NUMBER_ID_PATTERN = re.compile(r"\d{5,32}")
_RECIPIENT_PATTERN = re.compile(r"\d{8,15}")
_TEMPLATE_NAME_PATTERN = re.compile(r"[a-z0-9_]{1,512}")
_LANGUAGE_PATTERN = re.compile(r"[A-Za-z]{2,3}(?:_[A-Za-z]{2})?")


@dataclass(frozen=True, slots=True)
class WhatsAppDeliveryResult:
    remote_id: str


def validate_whatsapp_graph_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError("WhatsApp Graph base URL must be a valid HTTP address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("WhatsApp Graph base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ExternalServiceError("WhatsApp Graph base URL must not contain a query or fragment.")

    hostname = parsed.hostname.lower()
    is_loopback = hostname == "localhost"
    try:
        is_loopback = is_loopback or ip_address(hostname).is_loopback
    except ValueError:
        pass
    if parsed.scheme != "https" and not is_loopback:
        raise ExternalServiceError(
            "Use HTTPS for the WhatsApp Graph API. HTTP is allowed only for localhost tests."
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def validate_whatsapp_api_version(value: str) -> str:
    version = value.strip()
    if not _API_VERSION_PATTERN.fullmatch(version):
        raise ExternalServiceError("WhatsApp Graph API version must look like v25.0.")
    return version


def validate_phone_number_id(value: str) -> str:
    phone_number_id = value.strip()
    if not _PHONE_NUMBER_ID_PATTERN.fullmatch(phone_number_id):
        raise ExternalServiceError("WhatsApp Phone Number ID must contain 5 to 32 digits.")
    return phone_number_id


def normalize_recipient_phone(value: str) -> str:
    recipient = re.sub(r"[\s()+.-]", "", value.strip())
    if not _RECIPIENT_PATTERN.fullmatch(recipient):
        raise ExternalServiceError("WhatsApp recipient must be an 8 to 15 digit international number.")
    return recipient


def validate_template_name(value: str) -> str:
    name = value.strip()
    if not _TEMPLATE_NAME_PATTERN.fullmatch(name):
        raise ExternalServiceError(
            "WhatsApp template name may contain only lowercase letters, digits, and underscores."
        )
    return name


def validate_template_language(value: str) -> str:
    language = value.strip()
    if not _LANGUAGE_PATTERN.fullmatch(language):
        raise ExternalServiceError("WhatsApp template language must look like en or en_US.")
    return language


def _graph_base_url() -> str:
    return validate_whatsapp_graph_base_url(
        os.getenv("LOCALGROWTH_WHATSAPP_GRAPH_BASE_URL", DEFAULT_WHATSAPP_GRAPH_BASE_URL)
    )


def _graph_error(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
            code = str(error.get("code") or "").strip()
            if message and code:
                return f"WhatsApp Cloud API error {code}: {message}"
            if message:
                return f"WhatsApp Cloud API: {message}"
    return f"WhatsApp Cloud API returned HTTP {status_code}."


async def whatsapp_graph_request(
    phone_number_id: str,
    access_token: str,
    resource: str = "",
    *,
    api_version: str = DEFAULT_WHATSAPP_GRAPH_VERSION,
    method: str = "GET",
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    token = access_token.strip()
    if not token:
        raise ExternalServiceError("WhatsApp permanent access token is required.")
    number_id = validate_phone_number_id(phone_number_id)
    version = validate_whatsapp_api_version(api_version)
    suffix = f"/{resource.lstrip('/')}" if resource.strip("/") else ""
    endpoint = f"{_graph_base_url()}/{version}/{number_id}{suffix}"

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(
                method,
                endpoint,
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                params=params,
                json=json_body,
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(
            f"WhatsApp Cloud request failed ({type(error).__name__})."
        ) from error

    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"WhatsApp Cloud API returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        message = _graph_error(payload, response.status_code).replace(token, "[redacted]")
        raise ExternalServiceError(message)
    if not isinstance(payload, dict):
        raise ExternalServiceError("WhatsApp Cloud API returned an invalid JSON object.")
    return payload


async def test_whatsapp_connection(
    phone_number_id: str,
    api_version: str,
    access_token: str,
) -> dict[str, str]:
    expected_id = validate_phone_number_id(phone_number_id)
    payload = await whatsapp_graph_request(
        expected_id,
        access_token,
        api_version=api_version,
        params={"fields": "id,verified_name,display_phone_number,quality_rating"},
        timeout=15,
    )
    remote_id = str(payload.get("id") or "").strip()
    if remote_id != expected_id:
        raise ExternalServiceError(
            "The access token returned a different WhatsApp business phone number."
        )
    verified_name = str(payload.get("verified_name") or "WhatsApp Business").strip()
    return {
        "phoneNumberId": remote_id,
        "business": verified_name,
        "displayPhoneNumber": str(payload.get("display_phone_number") or "").strip(),
        "qualityRating": str(payload.get("quality_rating") or "UNKNOWN").strip(),
        "apiVersion": validate_whatsapp_api_version(api_version),
    }


def _post_excerpt(post: dict[str, Any]) -> str:
    body = str(post.get("body") or "").strip()
    return body[:700] if body else "No preview available"


async def send_whatsapp_approval_template(
    phone_number_id: str,
    recipient_phone: str,
    api_version: str,
    template_name: str,
    template_language: str,
    access_token: str,
    post: dict[str, Any],
) -> WhatsAppDeliveryResult:
    recipient = normalize_recipient_phone(recipient_phone)
    payload = await whatsapp_graph_request(
        phone_number_id,
        access_token,
        "messages",
        api_version=api_version,
        method="POST",
        json_body={
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "template",
            "template": {
                "name": validate_template_name(template_name),
                "language": {"code": validate_template_language(template_language)},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": str(post.get("channel") or "social")},
                            {"type": "text", "text": str(post.get("title") or "Untitled")[:200]},
                            {"type": "text", "text": str(post.get("revision") or 1)},
                            {"type": "text", "text": _post_excerpt(post)},
                        ],
                    }
                ],
            },
        },
        timeout=45,
    )
    messages = payload.get("messages")
    remote_id = ""
    if isinstance(messages, list) and messages and isinstance(messages[0], dict):
        remote_id = str(messages[0].get("id") or "").strip()
    if not remote_id or len(remote_id) > 256:
        raise ExternalServiceError("WhatsApp Cloud API did not return a message ID.")
    return WhatsAppDeliveryResult(remote_id=remote_id)
