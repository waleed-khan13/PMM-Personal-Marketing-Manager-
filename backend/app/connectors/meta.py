from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.meta import DEFAULT_GRAPH_API_VERSION, test_meta_page_connection


class MetaPagesAdapter:
    manifest = ConnectorManifest(
        adapter_id="meta",
        name="Meta Pages",
        description="Official Graph API publishing to a Facebook Page after human approval.",
        availability="available",
        capabilities=("publish",),
        config_fields=(
            ConnectorField(
                key="page_id",
                label="Facebook Page ID",
                required=True,
                placeholder="123456789012345",
                help_text="The numeric Page ID that owns this Page Access Token.",
            ),
            ConnectorField(
                key="api_version",
                label="Graph API version",
                required=True,
                placeholder=DEFAULT_GRAPH_API_VERSION,
                help_text="Pin the Graph API version so upgrades remain deliberate.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="page_access_token",
                label="Page Access Token",
                required=True,
                placeholder="EAAB...",
                help_text="Use a Page token with pages_read_engagement and pages_manage_posts.",
            ),
        ),
        allowed_scopes=("pages_read_engagement", "pages_manage_posts"),
        required_scopes=("pages_read_engagement", "pages_manage_posts"),
        docs_url="https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api",
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        details = await test_meta_page_connection(
            str(config.get("page_id") or ""),
            str(config.get("api_version") or DEFAULT_GRAPH_API_VERSION),
            secrets.get("page_access_token", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to Facebook Page {details['page']}.",
            remote_account_id=details["pageId"],
            details=details,
        )
