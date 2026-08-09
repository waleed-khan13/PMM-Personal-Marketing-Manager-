from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.instagram import test_instagram_connection
from app.services.meta import DEFAULT_GRAPH_API_VERSION


class InstagramAdapter:
    manifest = ConnectorManifest(
        adapter_id="instagram",
        name="Instagram Professional",
        description="Official Instagram Login API publishing for approved single-image posts.",
        availability="available",
        capabilities=("publish",),
        config_fields=(
            ConnectorField(
                key="user_id",
                label="Professional Account ID",
                required=True,
                placeholder="17841400000000000",
                help_text="The numeric ID of the Instagram Business or Creator account.",
            ),
            ConnectorField(
                key="api_version",
                label="Graph API version",
                required=True,
                placeholder=DEFAULT_GRAPH_API_VERSION,
                help_text="Pin the API version so upgrades remain deliberate.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="access_token",
                label="Instagram Access Token",
                required=True,
                placeholder="IGAA...",
                help_text="Use a Professional Account token from Instagram Login.",
            ),
        ),
        allowed_scopes=("instagram_business_basic", "instagram_business_content_publish"),
        required_scopes=("instagram_business_basic", "instagram_business_content_publish"),
        docs_url="https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api",
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        details = await test_instagram_connection(
            str(config.get("user_id") or ""),
            str(config.get("api_version") or DEFAULT_GRAPH_API_VERSION),
            secrets.get("access_token", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to Instagram @{details['username']}.",
            remote_account_id=details["userId"],
            details=details,
        )
