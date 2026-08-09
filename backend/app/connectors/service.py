from __future__ import annotations

from typing import Any

from app.connector_store import (
    connector_runtime,
    primary_connector_runtime,
    record_connector_test,
)
from app.connectors.base import ConnectorTestResult
from app.connectors.registry import get_adapter
from app.errors import AppError
from app.services.slack import send_approval_message
from app.services.whatsapp import send_whatsapp_approval_template


async def test_saved_connector(account_id: str) -> ConnectorTestResult:
    try:
        runtime = connector_runtime(account_id)
    except RuntimeError as error:
        raise AppError("Saved connector secrets could not be decrypted.") from error
    if not runtime["enabled"]:
        raise AppError("Enable this connector before testing it.")
    adapter = get_adapter(str(runtime["adapter_id"]))
    try:
        result = await adapter.test_connection(runtime["config"], runtime["secrets"])
    except AppError as error:
        record_connector_test(account_id, ok=False, remote_account_id=None, message=error.message)
        raise
    record_connector_test(
        account_id,
        ok=result.ok,
        remote_account_id=result.remote_account_id,
        message=result.message,
    )
    return result


async def send_saved_slack_approval(post: dict[str, Any]) -> dict[str, str]:
    runtime = primary_connector_runtime("slack", verified_only=True)
    message_ts = await send_approval_message(
        str(runtime["secrets"].get("bot_token") or ""),
        str(runtime["config"].get("approval_channel_id") or ""),
        post,
    )
    return {"accountId": str(runtime["id"]), "messageTs": message_ts}


async def send_saved_whatsapp_approval(post: dict[str, Any]) -> dict[str, str]:
    runtime = primary_connector_runtime("whatsapp", verified_only=True)
    result = await send_whatsapp_approval_template(
        str(runtime["config"].get("phone_number_id") or ""),
        str(runtime["config"].get("recipient_phone") or ""),
        str(runtime["config"].get("api_version") or ""),
        str(runtime["config"].get("template_name") or ""),
        str(runtime["config"].get("template_language") or ""),
        str(runtime["secrets"].get("access_token") or ""),
        post,
    )
    return {"accountId": str(runtime["id"]), "messageId": result.remote_id}
