from __future__ import annotations

from dataclasses import dataclass
from html import escape
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError


@dataclass(frozen=True, slots=True)
class WordPressPublishResult:
    remote_id: str
    remote_url: str | None


def validate_wordpress_site_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError("WordPress site URL must be a valid http or https address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("WordPress site URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ExternalServiceError("WordPress site URL must not contain a query or fragment.")

    hostname = parsed.hostname.lower()
    is_loopback = hostname == "localhost"
    try:
        is_loopback = is_loopback or ip_address(hostname).is_loopback
    except ValueError:
        pass
    if parsed.scheme != "https" and not is_loopback:
        raise ExternalServiceError(
            "Use HTTPS for a remote WordPress site. HTTP is allowed only on localhost."
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def _wordpress_endpoint(site_url: str, resource: str) -> str:
    return f"{validate_wordpress_site_url(site_url)}/wp-json/wp/v2/{resource.lstrip('/')}"


def _wordpress_error(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        message = str(payload.get("message") or "").strip()
        if message:
            return message
    return f"WordPress returned HTTP {status_code}."


async def wordpress_request(
    site_url: str,
    username: str,
    application_password: str,
    resource: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    if not username.strip() or not application_password.strip():
        raise ExternalServiceError("WordPress username and Application Password are required.")
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(
                method,
                _wordpress_endpoint(site_url, resource),
                auth=httpx.BasicAuth(username.strip(), application_password.strip()),
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                json=json_body,
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(f"WordPress request failed ({type(error).__name__}).") from error
    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"WordPress returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        raise ExternalServiceError(_wordpress_error(payload, response.status_code))
    if not isinstance(payload, dict):
        raise ExternalServiceError("WordPress returned an invalid JSON object.")
    return payload


async def test_wordpress_connection(
    site_url: str,
    username: str,
    application_password: str,
) -> dict[str, str]:
    user = await wordpress_request(
        site_url,
        username,
        application_password,
        "users/me?context=edit",
        timeout=15,
    )
    capabilities = user.get("capabilities")
    if isinstance(capabilities, dict) and capabilities.get("edit_posts") is False:
        raise ExternalServiceError("This WordPress user cannot create posts.")
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise ExternalServiceError("WordPress did not return an authenticated user ID.")
    return {
        "userId": user_id,
        "user": str(user.get("name") or user.get("slug") or username),
        "site": validate_wordpress_site_url(site_url),
    }


def _approved_content_html(post: dict[str, Any]) -> str:
    body = str(post.get("body") or "").strip()
    paragraphs = [part.strip() for part in body.split("\n\n") if part.strip()]
    html = "\n".join(f"<p>{escape(part).replace(chr(10), '<br>')}</p>" for part in paragraphs)
    hashtags = [
        tag if tag.startswith("#") else f"#{tag}"
        for value in post.get("hashtags") or []
        if (tag := str(value).strip())
    ]
    if hashtags:
        html = f"{html}\n<p>{escape(' '.join(hashtags))}</p>"
    return html


async def publish_wordpress_post(
    site_url: str,
    username: str,
    application_password: str,
    post: dict[str, Any],
) -> WordPressPublishResult:
    payload = await wordpress_request(
        site_url,
        username,
        application_password,
        "posts",
        method="POST",
        json_body={
            "title": str(post.get("title") or "").strip(),
            "content": _approved_content_html(post),
            "status": "publish",
        },
        timeout=45,
    )
    remote_id = str(payload.get("id") or "").strip()
    if not remote_id:
        raise ExternalServiceError("WordPress did not return a post ID.")
    remote_url = str(payload.get("link") or "").strip() or None
    return WordPressPublishResult(remote_id=remote_id, remote_url=remote_url)
