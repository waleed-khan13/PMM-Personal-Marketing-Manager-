from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError
from app.services.meta import DEFAULT_GRAPH_API_VERSION, validate_meta_api_version

DEFAULT_INSTAGRAM_GRAPH_BASE_URL = "https://graph.instagram.com"
_INSTAGRAM_ID_PATTERN = re.compile(r"\d{5,32}")


@dataclass(frozen=True, slots=True)
class InstagramPublishResult:
    remote_id: str
    remote_url: str | None = None


def validate_instagram_graph_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError(
            "Instagram Graph base URL must be a valid http or https address."
        )
    if parsed.username or parsed.password:
        raise ExternalServiceError("Instagram Graph base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ExternalServiceError("Instagram Graph base URL must not contain a query or fragment.")

    hostname = parsed.hostname.lower()
    is_loopback = hostname == "localhost"
    try:
        is_loopback = is_loopback or ip_address(hostname).is_loopback
    except ValueError:
        pass
    if parsed.scheme != "https" and not is_loopback:
        raise ExternalServiceError(
            "Use HTTPS for the Instagram Graph API. HTTP is allowed only for a localhost test service."
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def validate_instagram_user_id(value: str) -> str:
    user_id = value.strip()
    if not _INSTAGRAM_ID_PATTERN.fullmatch(user_id):
        raise ExternalServiceError("Instagram Professional Account ID must contain 5 to 32 digits.")
    return user_id


def validate_instagram_media_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise ExternalServiceError("Instagram image URL must be a public HTTPS address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("Instagram image URL must not contain credentials.")
    if parsed.fragment:
        raise ExternalServiceError("Instagram image URL must not contain a fragment.")

    hostname = parsed.hostname.lower()
    if hostname == "localhost":
        raise ExternalServiceError("Instagram cannot fetch an image from localhost.")
    try:
        if not ip_address(hostname).is_global:
            raise ExternalServiceError("Instagram image URL must use a public host.")
    except ValueError:
        pass
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))


def _graph_base_url() -> str:
    return validate_instagram_graph_base_url(
        os.getenv("SOCIUM_INSTAGRAM_GRAPH_BASE_URL", DEFAULT_INSTAGRAM_GRAPH_BASE_URL)
    )


def _instagram_error(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
            code = str(error.get("code") or "").strip()
            if message and code:
                return f"Instagram Graph API error {code}: {message}"
            if message:
                return f"Instagram Graph API: {message}"
    return f"Instagram Graph API returned HTTP {status_code}."


async def instagram_graph_request(
    subject_id: str,
    access_token: str,
    resource: str = "",
    *,
    api_version: str = DEFAULT_GRAPH_API_VERSION,
    method: str = "GET",
    params: dict[str, str] | None = None,
    data: dict[str, str] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    token = access_token.strip()
    if not token:
        raise ExternalServiceError("Instagram Professional Account Access Token is required.")
    subject = validate_instagram_user_id(subject_id)
    version = validate_meta_api_version(api_version)
    suffix = f"/{resource.lstrip('/')}" if resource.strip("/") else ""
    endpoint = f"{_graph_base_url()}/{version}/{subject}{suffix}"

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
        raise ExternalServiceError(
            f"Instagram Graph request failed ({type(error).__name__})."
        ) from error

    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"Instagram Graph API returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        message = _instagram_error(payload, response.status_code).replace(token, "[redacted]")
        raise ExternalServiceError(message)
    if not isinstance(payload, dict):
        raise ExternalServiceError("Instagram Graph API returned an invalid JSON object.")
    return payload


async def test_instagram_connection(
    user_id: str,
    api_version: str,
    access_token: str,
) -> dict[str, str]:
    expected_user_id = validate_instagram_user_id(user_id)
    payload = await instagram_graph_request(
        expected_user_id,
        access_token,
        api_version=api_version,
        params={"fields": "id,username,account_type"},
        timeout=15,
    )
    remote_user_id = str(payload.get("id") or "").strip()
    if not remote_user_id:
        raise ExternalServiceError("Instagram did not return a Professional Account ID.")
    if remote_user_id != expected_user_id:
        raise ExternalServiceError("The access token belongs to a different Instagram account.")
    username = str(payload.get("username") or "Instagram Professional Account").strip()
    return {
        "userId": remote_user_id,
        "username": username,
        "accountType": str(payload.get("account_type") or "PROFESSIONAL").strip(),
        "apiVersion": validate_meta_api_version(api_version),
    }


def approved_instagram_caption(post: dict[str, Any]) -> str:
    body = str(post.get("body") or "").strip()
    hashtags = [
        f"#{tag}"
        for value in post.get("hashtags") or []
        if (tag := str(value).strip().lstrip("#"))
    ]
    caption = "\n\n".join(part for part in (body, " ".join(hashtags)) if part)
    if not caption:
        raise ExternalServiceError("The approved Instagram caption is empty.")
    if len(caption) > 2_200:
        raise ExternalServiceError("Instagram captions must not exceed 2,200 characters.")
    return caption


async def publish_instagram_image(
    user_id: str,
    api_version: str,
    access_token: str,
    post: dict[str, Any],
    *,
    status_attempts: int = 10,
    status_delay: float = 1,
) -> InstagramPublishResult:
    image_url = validate_instagram_media_url(str(post.get("mediaUrl") or ""))
    caption = approved_instagram_caption(post)
    container = await instagram_graph_request(
        user_id,
        access_token,
        "media",
        api_version=api_version,
        method="POST",
        data={"image_url": image_url, "caption": caption},
        timeout=45,
    )
    container_id = str(container.get("id") or "").strip()
    if not container_id:
        raise ExternalServiceError("Instagram did not return a media container ID.")

    status_text = ""
    for attempt in range(max(status_attempts, 1)):
        status = await instagram_graph_request(
            container_id,
            access_token,
            api_version=api_version,
            params={"fields": "status_code,status"},
            timeout=15,
        )
        status_code = str(status.get("status_code") or "").strip().upper()
        status_text = str(status.get("status") or "").strip()
        if status_code == "FINISHED":
            break
        if status_code in {"ERROR", "EXPIRED"}:
            raise ExternalServiceError(
                f"Instagram media processing failed: {status_text or status_code}."
            )
        if attempt + 1 < max(status_attempts, 1):
            await asyncio.sleep(max(status_delay, 0))
    else:
        raise ExternalServiceError(
            f"Instagram media is still processing: {status_text or 'try again later'}."
        )

    published = await instagram_graph_request(
        user_id,
        access_token,
        "media_publish",
        api_version=api_version,
        method="POST",
        data={"creation_id": container_id},
        timeout=45,
    )
    remote_id = str(published.get("id") or "").strip()
    if not remote_id:
        raise ExternalServiceError("Instagram did not return a published media ID.")
    return InstagramPublishResult(remote_id=remote_id)
