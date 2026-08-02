from __future__ import annotations

from typing import Any

import httpx

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.errors import ExternalServiceError


class SlackAdapter:
    manifest = ConnectorManifest(
        adapter_id="slack",
        name="Slack",
        description="Outbound Socket Mode approvals and notifications without a public webhook.",
        availability="available",
        capabilities=("approval", "notification"),
        config_fields=(
            ConnectorField(
                key="approval_channel_id",
                label="Approval channel ID",
                required=True,
                placeholder="C0123456789",
                help_text="The channel where LocalGrowth will send approval requests.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="bot_token",
                label="Bot token",
                required=True,
                placeholder="xoxb-…",
                help_text="Slack bot token used for Web API calls.",
            ),
            ConnectorField(
                key="app_token",
                label="App-level token",
                required=True,
                placeholder="xapp-…",
                help_text="Socket Mode app token with connections:write.",
            ),
        ),
        allowed_scopes=("chat:write", "connections:write"),
        required_scopes=("chat:write", "connections:write"),
        docs_url="https://docs.slack.dev/tools/python-slack-sdk/socket-mode/",
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        bot_token = secrets.get("bot_token", "")
        app_token = secrets.get("app_token", "")
        if not bot_token.startswith("xoxb-"):
            raise ExternalServiceError("Slack bot token must start with xoxb-.")
        if not app_token.startswith("xapp-"):
            raise ExternalServiceError("Slack app-level token must start with xapp-.")
        if not str(config.get("approval_channel_id") or "").strip():
            raise ExternalServiceError("Slack approval channel ID is required.")

        timeout = httpx.Timeout(12.0, connect=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
                auth_response = await client.post(
                    "https://slack.com/api/auth.test",
                    headers={"Authorization": f"Bearer {bot_token}"},
                )
                socket_response = await client.post(
                    "https://slack.com/api/apps.connections.open",
                    headers={"Authorization": f"Bearer {app_token}"},
                )
        except httpx.HTTPError as error:
            raise ExternalServiceError("Could not reach Slack from this computer.") from error

        try:
            auth_payload = auth_response.json()
            socket_payload = socket_response.json()
        except ValueError as error:
            raise ExternalServiceError("Slack returned an unreadable response.") from error
        if not isinstance(auth_payload, dict) or not auth_payload.get("ok"):
            reason = str(auth_payload.get("error") or "authentication failed") if isinstance(auth_payload, dict) else "authentication failed"
            raise ExternalServiceError(f"Slack bot authentication failed: {reason}.")
        if not isinstance(socket_payload, dict) or not socket_payload.get("ok"):
            reason = str(socket_payload.get("error") or "Socket Mode failed") if isinstance(socket_payload, dict) else "Socket Mode failed"
            raise ExternalServiceError(f"Slack Socket Mode validation failed: {reason}.")

        team_id = str(auth_payload.get("team_id") or "")
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to Slack workspace {auth_payload.get('team') or team_id}.",
            remote_account_id=team_id or None,
            details={
                "team": str(auth_payload.get("team") or ""),
                "botUserId": str(auth_payload.get("user_id") or ""),
                "socketMode": "ready",
            },
        )
