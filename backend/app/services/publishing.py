from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.connector_store import primary_connector_runtime
from app.errors import AppError
from app.services.telegram import publish_post as publish_telegram_post
from app.services.wordpress import publish_wordpress_post
from app.store import telegram_runtime


@dataclass(frozen=True, slots=True)
class PublishTarget:
    channel: str
    name: str
    runtime: dict[str, Any]


@dataclass(frozen=True, slots=True)
class PublishResult:
    remote_id: str
    remote_url: str | None = None


def resolve_publish_target(channel: str) -> PublishTarget:
    if channel == "telegram":
        runtime = telegram_runtime()
        if not runtime["bot_token"] or not runtime["chat_id"]:
            raise AppError("Connect Telegram before publishing.")
        return PublishTarget(channel=channel, name="Telegram", runtime=runtime)
    if channel == "blog":
        runtime = primary_connector_runtime("wordpress", verified_only=True)
        return PublishTarget(channel=channel, name="WordPress", runtime=runtime)
    raise AppError(f"{channel} publisher is not installed yet.")


async def publish_to_target(target: PublishTarget, post: dict[str, Any]) -> PublishResult:
    if target.channel == "telegram":
        remote_id = await publish_telegram_post(
            str(target.runtime["bot_token"]),
            str(target.runtime["chat_id"]),
            post,
        )
        return PublishResult(remote_id=remote_id)
    if target.channel == "blog":
        result = await publish_wordpress_post(
            str(target.runtime["config"].get("site_url") or ""),
            str(target.runtime["secrets"].get("username") or ""),
            str(target.runtime["secrets"].get("application_password") or ""),
            post,
        )
        return PublishResult(remote_id=result.remote_id, remote_url=result.remote_url)
    raise AppError(f"{target.channel} publisher is not installed yet.")
