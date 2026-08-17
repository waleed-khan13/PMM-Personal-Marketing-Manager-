from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.whatsapp import DEFAULT_WHATSAPP_GRAPH_VERSION, test_whatsapp_connection


class WhatsAppAdapter:
    manifest = ConnectorManifest(
        adapter_id="whatsapp",
        name="WhatsApp Cloud",
        description="Approved-template review notifications from a strict-localhost workspace.",
        availability="notification-only",
        capabilities=("notification",),
        config_fields=(
            ConnectorField(
                key="phone_number_id",
                label="Phone Number ID",
                required=True,
                placeholder="123456789012345",
                help_text="The numeric ID for the sending business phone number.",
            ),
            ConnectorField(
                key="recipient_phone",
                label="Review recipient",
                required=True,
                placeholder="+923001234567",
                help_text="International number that receives draft review notifications.",
            ),
            ConnectorField(
                key="api_version",
                label="Graph API version",
                required=True,
                placeholder=DEFAULT_WHATSAPP_GRAPH_VERSION,
                help_text="Pin the Graph API version so upgrades remain deliberate.",
            ),
            ConnectorField(
                key="template_name",
                label="Approved template name",
                required=True,
                placeholder="socium_draft_review",
                help_text="An approved template with four body variables.",
            ),
            ConnectorField(
                key="template_language",
                label="Template language",
                required=True,
                placeholder="en_US",
                help_text="The exact language code approved with the template.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="access_token",
                label="Permanent access token",
                required=True,
                placeholder="EAA...",
                help_text="Stored encrypted and sent only in the Authorization header.",
            ),
        ),
        allowed_scopes=("whatsapp_business_messaging", "whatsapp_business_management"),
        required_scopes=("whatsapp_business_messaging", "whatsapp_business_management"),
        docs_url=(
            "https://www.postman.com/meta/whatsapp-business-platform/"
            "documentation/wlk6lh4/whatsapp-cloud-api"
        ),
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        details = await test_whatsapp_connection(
            str(config.get("phone_number_id") or ""),
            str(config.get("api_version") or DEFAULT_WHATSAPP_GRAPH_VERSION),
            secrets.get("access_token", ""),
        )
        return ConnectorTestResult(
            ok=True,
            message=f"Connected to WhatsApp Business {details['business']}.",
            remote_account_id=details["phoneNumberId"],
            details=details,
        )
