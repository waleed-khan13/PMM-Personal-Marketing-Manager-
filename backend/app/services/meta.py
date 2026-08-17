from __future__ import annotations

import os
import re
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError

DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com"
DEFAULT_GRAPH_API_VERSION = "v25.0"
_API_VERSION_PATTERN = re.compile(r"v\d+\.\d+")
_PAGE_ID_PATTERN = re.compile(r"\d{5,32}")


@dataclass(frozen=True, slots=True)
class MetaPublishResult:
    remote_id: str
    remote_url: str | None = None


def validate_meta_graph_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError("Meta Graph base URL must be a valid http or https address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("Meta Graph base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ExternalServiceError("Meta Graph base URL must not contain a query or fragment.")

    hostname = parsed.hostname.lower()
    is_loopback = hostname == "localhost"
    try:
        is_loopback = is_loopback or ip_address(hostname).is_loopback
    except ValueError:
        pass
    if parsed.scheme != "https" and not is_loopback:
        raise ExternalServiceError(
            "Use HTTPS for the Meta Graph API. HTTP is allowed only for a localhost test service."
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def validate_meta_api_version(value: str) -> str:
    version = value.strip()
    if not _API_VERSION_PATTERN.fullmatch(version):
        raise ExternalServiceError("Meta Graph API version must look like v25.0.")
    return version


def validate_meta_page_id(value: str) -> str:
    page_id = value.strip()
    if not _PAGE_ID_PATTERN.fullmatch(page_id):
        raise ExternalServiceError("Facebook Page ID must contain 5 to 32 digits.")
    return page_id


def _graph_base_url() -> str:
    return validate_meta_graph_base_url(
        os.getenv("SOCIUM_META_GRAPH_BASE_URL", DEFAULT_GRAPH_BASE_URL)
    )


def _meta_error(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
            code = str(error.get("code") or "").strip()
            if message and code:
                return f"Meta Graph API error {code}: {message}"
            if message:
                return f"Meta Graph API: {message}"
    return f"Meta Graph API returned HTTP {status_code}."


async def meta_graph_request(
    page_id: str,
    page_access_token: str,
    resource: str = "",
    *,
    api_version: str = DEFAULT_GRAPH_API_VERSION,
    method: str = "GET",
    params: dict[str, str] | None = None,
    data: dict[str, str] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    token = page_access_token.strip()
    if not token:
        raise ExternalServiceError("Facebook Page Access Token is required.")
    page = validate_meta_page_id(page_id)
    version = validate_meta_api_version(api_version)
    suffix = f"/{resource.lstrip('/')}" if resource.strip("/") else ""
    endpoint = f"{_graph_base_url()}/{version}/{page}{suffix}"

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(
                method,
                endpoint,
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                params=params,
                data=data,
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(f"Meta Graph request failed ({type(error).__name__}).") from error

    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"Meta Graph API returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        message = _meta_error(payload, response.status_code).replace(token, "[redacted]")
        raise ExternalServiceError(message)
    if not isinstance(payload, dict):
        raise ExternalServiceError("Meta Graph API returned an invalid JSON object.")
    return payload


async def test_meta_page_connection(
    page_id: str,
    api_version: str,
    page_access_token: str,
) -> dict[str, str]:
    expected_page_id = validate_meta_page_id(page_id)
    payload = await meta_graph_request(
        expected_page_id,
        page_access_token,
        api_version=api_version,
        params={"fields": "id,name"},
        timeout=15,
    )
    remote_page_id = str(payload.get("id") or "").strip()
    if not remote_page_id:
        raise ExternalServiceError("Meta did not return a Facebook Page ID.")
    if remote_page_id != expected_page_id:
        raise ExternalServiceError("The Page Access Token belongs to a different Facebook Page.")

    page_name = str(payload.get("name") or "Facebook Page").strip()
    return {
        "pageId": remote_page_id,
        "page": page_name,
        "apiVersion": validate_meta_api_version(api_version),
    }


def approved_facebook_message(post: dict[str, Any]) -> str:
    body = str(post.get("body") or "").strip()
    hashtags = [
        tag if tag.startswith("#") else f"#{tag}"
        for value in post.get("hashtags") or []
        if (tag := str(value).strip().lstrip("#"))
    ]
    return "\n\n".join(part for part in (body, " ".join(hashtags)) if part)


async def publish_facebook_page_post(
    page_id: str,
    api_version: str,
    page_access_token: str,
    post: dict[str, Any],
) -> MetaPublishResult:
    message = approved_facebook_message(post)
    if not message:
        raise ExternalServiceError("The approved Facebook post is empty.")
    payload = await meta_graph_request(
        page_id,
        page_access_token,
        "feed",
        api_version=api_version,
        method="POST",
        data={"message": message},
        timeout=45,
    )
    remote_id = str(payload.get("id") or "").strip()
    if not remote_id:
        raise ExternalServiceError("Meta did not return a Facebook post ID.")
    return MetaPublishResult(remote_id=remote_id)
