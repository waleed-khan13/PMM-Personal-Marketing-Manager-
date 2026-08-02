from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import __version__
from app.config import get_settings
from app.connector_store import (
    create_connector,
    delete_connector,
    public_connector_state,
    update_connector,
)
from app.connectors.service import test_saved_connector
from app.errors import AppError, ExternalServiceError
from app.poller import TelegramPoller
from app.scheduler import LocalScheduler
from app.schemas import (
    ConnectorAccountUpsert,
    DecisionRequest,
    EditPostRequest,
    GeneratePostRequest,
    PollingUpdate,
    ProviderUpdate,
    PublishRequest,
    SchedulePostRequest,
    SchedulerUpdate,
    TelegramUpdate,
    WorkspaceUpdate,
)
from app.services.provider import generate_content, test_provider, validate_base_url
from app.services.telegram import (
    delete_webhook,
    publish_post,
    send_approval_request,
    test_connection,
)
from app.store import (
    cancel_job,
    create_post,
    decide_post,
    edit_post,
    fail_publish,
    finish_publish,
    initialize_storage,
    provider_runtime,
    public_state,
    record_approval_sent,
    reserve_publish,
    retry_job,
    schedule_post,
    set_scheduler_paused,
    set_telegram_polling,
    telegram_runtime,
    update_provider,
    update_telegram,
    update_workspace,
    workspace_runtime,
)

settings = get_settings()
telegram_poller = TelegramPoller(settings.telegram_poll_timeout)
local_scheduler = LocalScheduler(
    settings.scheduler_interval,
    settings.scheduler_catch_up_hours,
    settings.scheduler_stale_minutes,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize_storage()
    telegram_poller.start()
    local_scheduler.start()
    try:
        yield
    finally:
        await local_scheduler.stop()
        await telegram_poller.stop()


app = FastAPI(
    title="LocalGrowth OS Local API",
    description="Loopback-only API for the downloadable LocalGrowth OS application.",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
    return JSONResponse({"ok": False, "error": error.message}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError) -> JSONResponse:
    details = error.errors()
    message = str(details[0].get("msg") or "Invalid request.") if details else "Invalid request."
    return JSONResponse({"ok": False, "error": message}, status_code=422)


def state_response() -> dict[str, Any]:
    state = public_state(telegram_poller.status(), local_scheduler.status())
    state["connectors"] = public_connector_state()
    return state


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "localgrowth-api",
        "version": __version__,
        "mode": "local_only",
        "database": "sqlite",
    }


@app.get("/api/state")
def get_state() -> JSONResponse:
    return JSONResponse(state_response(), headers={"Cache-Control": "no-store"})


@app.put("/api/settings/workspace")
def save_workspace(payload: WorkspaceUpdate) -> dict[str, Any]:
    update_workspace(payload)
    return {"ok": True, "state": state_response()}


@app.put("/api/settings/provider")
def save_provider(payload: ProviderUpdate) -> dict[str, Any]:
    try:
        validate_base_url(payload.base_url)
    except ExternalServiceError as error:
        raise AppError(error.message) from error
    update_provider(payload)
    return {"ok": True, "state": state_response()}


@app.post("/api/providers/test")
async def provider_health() -> JSONResponse:
    result = await test_provider(provider_runtime())
    return JSONResponse(
        result.model_dump(by_alias=True, exclude_none=True),
        status_code=200 if result.ok else 502,
    )


@app.put("/api/settings/telegram")
async def save_telegram(payload: TelegramUpdate) -> dict[str, Any]:
    update_telegram(payload)
    await telegram_poller.refresh()
    return {"ok": True, "state": state_response()}


@app.post("/api/integrations/telegram/test")
async def telegram_health() -> dict[str, Any]:
    runtime = telegram_runtime()
    if not runtime["bot_token"]:
        raise AppError("Save a Telegram bot token first.")
    bot = await test_connection(str(runtime["bot_token"]))
    return {"ok": True, "message": f"Connected to {bot['name']}.", "bot": bot}


@app.put("/api/integrations/telegram/polling")
async def configure_polling(payload: PollingUpdate) -> dict[str, Any]:
    runtime = telegram_runtime()
    if payload.enabled:
        if not runtime["bot_token"] or not runtime["chat_id"]:
            raise AppError("Save and test Telegram before starting local approvals.")
        await test_connection(str(runtime["bot_token"]))
        await delete_webhook(str(runtime["bot_token"]))
    set_telegram_polling(payload.enabled)
    await telegram_poller.refresh()
    return {
        "ok": True,
        "message": "Local Telegram approvals started." if payload.enabled else "Local Telegram approvals stopped.",
        "state": state_response(),
    }


@app.post("/api/posts/generate")
async def generate_post(payload: GeneratePostRequest) -> dict[str, Any]:
    provider = provider_runtime()
    if not provider["base_url"] or not provider["model"]:
        raise AppError("Connect an AI provider and select a model first.")
    request_data = payload.model_dump()
    generated = await generate_content(provider, request_data, workspace_runtime())
    post = create_post(
        request=request_data,
        content=generated.model_dump(),
        provider=provider,
    )

    notification: dict[str, Any] | None = None
    if payload.notify_telegram:
        try:
            telegram = telegram_runtime()
            if not telegram["bot_token"] or not telegram["chat_id"]:
                raise AppError("Telegram approval is not configured.")
            await send_approval_request(str(telegram["bot_token"]), str(telegram["chat_id"]), post)
            record_approval_sent(post["id"])
            notification = {"ok": True, "message": "Approval request sent to Telegram."}
        except AppError as error:
            notification = {"ok": False, "message": error.message}
    return {"ok": True, "post": post, "notification": notification, "state": state_response()}


@app.patch("/api/posts/{post_id}")
def update_post(post_id: str, payload: EditPostRequest) -> dict[str, Any]:
    edit_post(post_id, payload)
    return {"ok": True, "state": state_response()}


@app.post("/api/posts/{post_id}/decision")
def post_decision(post_id: str, payload: DecisionRequest) -> dict[str, Any]:
    decide_post(post_id, payload.revision, payload.decision == "approve")
    return {"ok": True, "state": state_response()}


@app.post("/api/posts/{post_id}/publish")
async def post_publish(post_id: str, payload: PublishRequest) -> dict[str, Any]:
    reserved = reserve_publish(post_id, payload.revision)
    try:
        telegram = telegram_runtime()
        if not telegram["bot_token"] or not telegram["chat_id"]:
            raise AppError("Connect Telegram before publishing.")
        remote_id = await publish_post(str(telegram["bot_token"]), str(telegram["chat_id"]), reserved)
        finish_publish(post_id, payload.revision, remote_id)
    except Exception as error:
        message = error.message if isinstance(error, AppError) else "Publish failed."
        fail_publish(post_id, payload.revision, message)
        raise
    return {"ok": True, "state": state_response()}


@app.post("/api/posts/{post_id}/schedule")
async def post_schedule(post_id: str, payload: SchedulePostRequest) -> dict[str, Any]:
    job, created = schedule_post(post_id, payload, settings.scheduler_catch_up_hours)
    local_scheduler.wake()
    return {
        "ok": True,
        "created": created,
        "job": job,
        "message": "Publish scheduled locally." if created else "This exact revision is already scheduled.",
        "state": state_response(),
    }


@app.post("/api/jobs/{job_id}/cancel")
async def job_cancel(job_id: str) -> dict[str, Any]:
    job = cancel_job(job_id)
    local_scheduler.wake()
    return {"ok": True, "job": job, "state": state_response()}


@app.post("/api/jobs/{job_id}/retry")
async def job_retry(job_id: str) -> dict[str, Any]:
    job = retry_job(job_id)
    local_scheduler.wake()
    return {"ok": True, "job": job, "state": state_response()}


@app.put("/api/scheduler")
async def scheduler_update(payload: SchedulerUpdate) -> dict[str, Any]:
    set_scheduler_paused(payload.paused)
    local_scheduler.set_paused_state(payload.paused)
    return {
        "ok": True,
        "message": "Local scheduler paused." if payload.paused else "Local scheduler resumed.",
        "state": state_response(),
    }


@app.get("/api/connectors")
def get_connectors() -> dict[str, Any]:
    return public_connector_state()


@app.post("/api/connectors")
def save_connector(payload: ConnectorAccountUpsert) -> dict[str, Any]:
    account = create_connector(payload)
    return {"ok": True, "account": account, "state": state_response()}


@app.put("/api/connectors/{account_id}")
def replace_connector(account_id: str, payload: ConnectorAccountUpsert) -> dict[str, Any]:
    account = update_connector(account_id, payload)
    return {"ok": True, "account": account, "state": state_response()}


@app.post("/api/connectors/{account_id}/test")
async def connector_health(account_id: str) -> dict[str, Any]:
    result = await test_saved_connector(account_id)
    return {**result.public_dict(), "state": state_response()}


@app.delete("/api/connectors/{account_id}")
def remove_connector(account_id: str) -> dict[str, Any]:
    delete_connector(account_id)
    return {"ok": True, "state": state_response()}
