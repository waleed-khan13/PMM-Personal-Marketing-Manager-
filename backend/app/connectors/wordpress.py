from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.wordpress import test_wordpress_connection


class WordPressAdapter:
    manifest = ConnectorManifest(
        adapter_id="wordpress",
        name="WordPress",
        description="Official REST API publishing to a WordPress site after human approval.",
        availability="available",
        capabilities=("publish", "cms"),
        config_fields=(
            ConnectorField(
                key="site_url",
                label="Site URL",
                required=True,
                placeholder="https://example.com",
                help_text="The WordPress site root. Remote sites must use HTTPS.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="username",
                label="Username",
                required=True,
                placeholder="wordpress-user",
                help_text="The WordPress user that owns the Application Password.",
            ),
            ConnectorField(
                key="application_password",
                label="Application Password",
                required=True,
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx",
                help_text="Create this in WordPress user profile settings. Do not use the login password.",
            ),
        ),
        allowed_scopes=("posts:write",),
        required_scopes=("posts:write",),
        docs_url="https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/",
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        details = await test_wordpress_connection(
            str(config.get("site_url") or ""),
            secrets.get("username", ""),
            secrets.get("application_password", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to WordPress as {details['user']}.",
            remote_account_id=details["userId"],
            details=details,
        )
