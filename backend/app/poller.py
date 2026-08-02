from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import Any

from app.errors import ExternalServiceError
from app.services.telegram import answer_callback, get_updates
from app.store import process_telegram_update, telegram_runtime


class TelegramPoller:
    def __init__(self, poll_timeout: int) -> None:
        self.poll_timeout = poll_timeout
        self._task: asyncio.Task[None] | None = None
        self._active = False
        self._status = "stopped"
        self._last_error: str | None = None

    def status(self) -> dict[str, Any]:
        return {
            "active": self._active,
            "status": self._status,
            "lastError": self._last_error,
        }

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="telegram-local-poller")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        self._active = False
        self._status = "stopped"

    async def refresh(self) -> None:
        await self.stop()
        self._status = "starting"
        self.start()

    async def _run(self) -> None:
        backoff = 2
        try:
            while True:
                runtime = telegram_runtime()
                if not runtime["polling_enabled"]:
                    self._active = False
                    self._status = "stopped"
                    self._last_error = None
                    await asyncio.sleep(1)
                    continue
                token = str(runtime["bot_token"])
                if not token or not runtime["chat_id"]:
                    self._active = False
                    self._status = "configuration_required"
                    self._last_error = "Telegram token and chat ID are required."
                    await asyncio.sleep(2)
                    continue

                self._active = True
                self._status = "listening"
                try:
                    updates = await get_updates(
                        token,
                        int(runtime["last_update_id"]) + 1,
                        self.poll_timeout,
                    )
                    for update in updates:
                        callback = process_telegram_update(update)
                        if callback is not None:
                            callback_id, message = callback
                            await answer_callback(token, callback_id, message)
                    self._last_error = None
                    backoff = 2
                except ExternalServiceError as error:
                    self._active = False
                    self._status = "retrying"
                    self._last_error = error.message
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
                except Exception:  # noqa: BLE001 - the long-running local worker must recover safely.
                    self._active = False
                    self._status = "retrying"
                    self._last_error = "Local Telegram polling hit an unexpected error."
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
        except asyncio.CancelledError:
            self._active = False
            self._status = "stopped"
            raise
