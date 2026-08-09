from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.linkedin import (
    DEFAULT_LINKEDIN_VERSION,
    test_linkedin_connection,
    test_linkedin_organization_connection,
    validate_linkedin_version,
)


class LinkedInMemberAdapter:
    manifest = ConnectorManifest(
        adapter_id="linkedin",
        name="LinkedIn Member",
        description="Official Posts API publishing for an authenticated member after human approval.",
        availability="available",
        capabilities=("publish",),
        config_fields=(
            ConnectorField(
                key="person_id",
                label="LinkedIn Member ID",
                required=True,
                placeholder="782bbtaQ",
                help_text="The sub value returned by LinkedIn OpenID Connect userinfo.",
            ),
            ConnectorField(
                key="api_version",
                label="LinkedIn API version",
                required=True,
                placeholder=DEFAULT_LINKEDIN_VERSION,
                help_text="Pin the YYYYMM marketing API version and review it before sunset.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="access_token",
                label="OAuth Access Token",
                required=True,
                placeholder="AQV...",
                help_text="Use a 3-legged OAuth token granted by the member.",
            ),
        ),
        allowed_scopes=("openid", "profile", "w_member_social"),
        required_scopes=("openid", "profile", "w_member_social"),
        docs_url=(
            "https://learn.microsoft.com/en-us/linkedin/marketing/"
            "community-management/shares/posts-api"
        ),
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        api_version = validate_linkedin_version(
            str(config.get("api_version") or DEFAULT_LINKEDIN_VERSION)
        )
        details = await test_linkedin_connection(
            str(config.get("person_id") or ""),
            secrets.get("access_token", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to LinkedIn as {details['name']}.",
            remote_account_id=details["personId"],
            details={**details, "apiVersion": api_version},
        )


class LinkedInOrganizationAdapter:
    manifest = ConnectorManifest(
        adapter_id="linkedin-organization",
        name="LinkedIn Company Page",
        description=(
            "Access-gated official Posts API publishing for a Page after member and "
            "ORGANIC_SHARE_CREATE authorization checks."
        ),
        availability="access-gated",
        capabilities=("publish",),
        config_fields=(
            ConnectorField(
                key="person_id",
                label="LinkedIn Member ID",
                required=True,
                placeholder="782bbtaQ",
                help_text="The sub value returned by LinkedIn OpenID Connect userinfo.",
            ),
            ConnectorField(
                key="organization_id",
                label="LinkedIn Organization ID",
                required=True,
                placeholder="5515715",
                help_text="The numeric ID from the LinkedIn Company Page URN.",
            ),
            ConnectorField(
                key="api_version",
                label="LinkedIn API version",
                required=True,
                placeholder=DEFAULT_LINKEDIN_VERSION,
                help_text="Pin the YYYYMM marketing API version and review it before sunset.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="access_token",
                label="OAuth Access Token",
                required=True,
                placeholder="AQV...",
                help_text="Use a 3-legged OAuth token granted by an eligible Page operator.",
            ),
        ),
        allowed_scopes=(
            "openid",
            "profile",
            "w_organization_social",
            "rw_organization_admin",
        ),
        required_scopes=(
            "openid",
            "profile",
            "w_organization_social",
            "rw_organization_admin",
        ),
        docs_url=(
            "https://learn.microsoft.com/en-us/linkedin/marketing/"
            "community-management/shares/posts-api"
        ),
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        api_version = validate_linkedin_version(
            str(config.get("api_version") or DEFAULT_LINKEDIN_VERSION)
        )
        details = await test_linkedin_organization_connection(
            str(config.get("person_id") or ""),
            str(config.get("organization_id") or ""),
            api_version,
            secrets.get("access_token", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=(
                f"{details['name']} can publish to LinkedIn Page "
                f"{details['organizationId']}."
            ),
            remote_account_id=details["organizationId"],
            details={**details, "apiVersion": api_version},
        )
