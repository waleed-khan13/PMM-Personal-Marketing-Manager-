from __future__ import annotations

import os
import re
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.errors import ExternalServiceError

DEFAULT_LINKEDIN_API_BASE_URL = "https://api.linkedin.com"
DEFAULT_LINKEDIN_VERSION = "202607"
_LINKEDIN_VERSION_PATTERN = re.compile(r"20\d{4}")
_PERSON_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{2,128}")
_POST_URN_PATTERN = re.compile(r"urn:li:(?:share|ugcPost):\d+")


@dataclass(frozen=True, slots=True)
class LinkedInApiResponse:
    payload: dict[str, Any]
    headers: dict[str, str]


@dataclass(frozen=True, slots=True)
class LinkedInPublishResult:
    remote_id: str
    remote_url: str | None = None


def validate_linkedin_api_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ExternalServiceError("LinkedIn API base URL must be a valid http or https address.")
    if parsed.username or parsed.password:
        raise ExternalServiceError("LinkedIn API base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ExternalServiceError("LinkedIn API base URL must not contain a query or fragment.")

    hostname = parsed.hostname.lower()
    is_loopback = hostname == "localhost"
    try:
        is_loopback = is_loopback or ip_address(hostname).is_loopback
    except ValueError:
        pass
    if parsed.scheme != "https" and not is_loopback:
        raise ExternalServiceError(
            "Use HTTPS for LinkedIn. HTTP is allowed only for a localhost test service."
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def validate_linkedin_version(value: str) -> str:
    version = value.strip()
    if not _LINKEDIN_VERSION_PATTERN.fullmatch(version):
        raise ExternalServiceError("LinkedIn API version must use YYYYMM format, such as 202607.")
    return version


def validate_linkedin_person_id(value: str) -> str:
    person_id = value.strip()
    if not _PERSON_ID_PATTERN.fullmatch(person_id):
        raise ExternalServiceError("LinkedIn Member ID contains unsupported characters.")
    return person_id


def _api_base_url() -> str:
    return validate_linkedin_api_base_url(
        os.getenv("LOCALGROWTH_LINKEDIN_API_BASE_URL", DEFAULT_LINKEDIN_API_BASE_URL)
    )


def _linkedin_error(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        message = str(payload.get("message") or "").strip()
        code = str(payload.get("serviceErrorCode") or payload.get("status") or "").strip()
        if message and code:
            return f"LinkedIn API error {code}: {message}"
        if message:
            return f"LinkedIn API: {message}"
    return f"LinkedIn API returned HTTP {status_code}."


async def linkedin_api_request(
    resource: str,
    access_token: str,
    *,
    method: str = "GET",
    api_version: str | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 30,
) -> LinkedInApiResponse:
    token = access_token.strip()
    if not token:
        raise ExternalServiceError("LinkedIn OAuth Access Token is required.")
    endpoint = f"{_api_base_url()}/{resource.lstrip('/')}"
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if api_version is not None:
        headers.update(
            {
                "Linkedin-Version": validate_linkedin_version(api_version),
                "X-Restli-Protocol-Version": "2.0.0",
                "Content-Type": "application/json",
            }
        )

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(
                method,
                endpoint,
                headers=headers,
                json=json_body,
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(
            f"LinkedIn request failed ({type(error).__name__})."
        ) from error

    payload: object = {}
    if response.content:
        try:
            payload = response.json()
        except ValueError as error:
            if response.is_success:
                raise ExternalServiceError(
                    f"LinkedIn API returned a non-JSON response ({response.status_code})."
                ) from error
    if not response.is_success:
        message = _linkedin_error(payload, response.status_code).replace(token, "[redacted]")
        raise ExternalServiceError(message)
    if not isinstance(payload, dict):
        raise ExternalServiceError("LinkedIn API returned an invalid JSON object.")
    return LinkedInApiResponse(payload=payload, headers=dict(response.headers))


async def test_linkedin_connection(
    person_id: str,
    access_token: str,
) -> dict[str, str]:
    expected_person_id = validate_linkedin_person_id(person_id)
    response = await linkedin_api_request("v2/userinfo", access_token, timeout=15)
    remote_person_id = str(response.payload.get("sub") or "").strip()
    if not remote_person_id:
        raise ExternalServiceError("LinkedIn did not return a Member ID from userinfo.")
    if remote_person_id != expected_person_id:
        raise ExternalServiceError("The OAuth token belongs to a different LinkedIn member.")
    return {
        "personId": remote_person_id,
        "name": str(response.payload.get("name") or "LinkedIn Member").strip(),
    }


def approved_linkedin_commentary(post: dict[str, Any]) -> str:
    body = str(post.get("body") or "").strip()
    hashtags = [
        f"#{tag}"
        for value in post.get("hashtags") or []
        if (tag := str(value).strip().lstrip("#"))
    ]
    commentary = "\n\n".join(part for part in (body, " ".join(hashtags)) if part)
    if not commentary:
        raise ExternalServiceError("The approved LinkedIn post is empty.")
    if len(commentary) > 3_000:
        raise ExternalServiceError("LinkedIn text posts must not exceed 3,000 characters.")
    return commentary


async def publish_linkedin_member_post(
    person_id: str,
    api_version: str,
    access_token: str,
    post: dict[str, Any],
) -> LinkedInPublishResult:
    author = f"urn:li:person:{validate_linkedin_person_id(person_id)}"
    response = await linkedin_api_request(
        "rest/posts",
        access_token,
        method="POST",
        api_version=api_version,
        json_body={
            "author": author,
            "commentary": approved_linkedin_commentary(post),
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        },
        timeout=45,
    )
    remote_id = str(
        response.headers.get("x-restli-id") or response.payload.get("id") or ""
    ).strip()
    if not _POST_URN_PATTERN.fullmatch(remote_id):
        raise ExternalServiceError("LinkedIn did not return a valid published post URN.")
    return LinkedInPublishResult(remote_id=remote_id)
