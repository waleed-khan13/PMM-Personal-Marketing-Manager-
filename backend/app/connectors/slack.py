from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.errors import ExternalServiceError
from app.services.slack import open_socket_url, slack_request


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

        auth_payload = await slack_request(bot_token, "auth.test", timeout=12)
        await open_socket_url(app_token)

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
