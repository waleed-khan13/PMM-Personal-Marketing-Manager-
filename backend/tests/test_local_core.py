from __future__ import annotations

import asyncio
import sqlite3
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path


def test_health_state_and_encrypted_settings(client) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["mode"] == "local_only"
    assert health.json()["database"] == "sqlite"

    initial = client.get("/api/state")
    assert initial.status_code == 200
    assert initial.json()["runtime"]["database"] == "sqlite"

    workspace = client.put(
        "/api/settings/workspace",
        json={
            "name": "Test workspace",
            "businessName": "Example Studio",
            "description": "A local-first test business.",
            "timezone": "Asia/Karachi",
        },
    )
    assert workspace.status_code == 200
    assert workspace.json()["state"]["workspace"]["businessName"] == "Example Studio"

    provider = client.put(
        "/api/settings/provider",
        json={
            "kind": "openai-compatible",
            "baseUrl": "https://provider.example/v1",
            "model": "test-model",
            "apiKey": "do-not-store-in-plaintext",
        },
    )
    assert provider.status_code == 200
    assert provider.json()["state"]["provider"]["hasApiKey"] is True

    from app.config import get_settings

    database_path = Path(get_settings().database_path)
    with sqlite3.connect(database_path) as connection:
        encrypted = connection.execute("SELECT api_key FROM provider_settings WHERE id = 1").fetchone()[0]
    assert "do-not-store-in-plaintext" not in encrypted


def test_draft_version_approval_and_single_publish(client, monkeypatch) -> None:
    from app.schemas import GeneratedContent

    async def fake_generate(*_args, **_kwargs):
        return GeneratedContent(
            title="Local launch",
            body="A factual post generated for review.",
            hashtags=["#local"],
            rationale="Tests the approval-first content path.",
        )

    async def fake_publish(*_args, **_kwargs):
        return "telegram-message-42"

    monkeypatch.setattr("app.main.generate_content", fake_generate)
    monkeypatch.setattr("app.main.publish_post", fake_publish)

    generated = client.post(
        "/api/posts/generate",
        json={
            "topic": "Local launch",
            "channel": "telegram",
            "tone": "Clear",
            "objective": "Explain the release",
            "notifyTelegram": False,
        },
    )
    assert generated.status_code == 200
    post = generated.json()["post"]
    assert post["revision"] == 1
    assert post["status"] == "pending"

    approved = client.post(
        f"/api/posts/{post['id']}/decision",
        json={"decision": "approve", "revision": 1},
    )
    assert approved.status_code == 200

    edited = client.patch(
        f"/api/posts/{post['id']}",
        json={"title": "Revised launch", "body": "Revised factual copy.", "hashtags": ["local"]},
    )
    assert edited.status_code == 200
    revised = next(item for item in edited.json()["state"]["posts"] if item["id"] == post["id"])
    assert revised["revision"] == 2
    assert revised["status"] == "pending"

    stale = client.post(
        f"/api/posts/{post['id']}/decision",
        json={"decision": "approve", "revision": 1},
    )
    assert stale.status_code == 400

    approved_again = client.post(
        f"/api/posts/{post['id']}/decision",
        json={"decision": "approve", "revision": 2},
    )
    assert approved_again.status_code == 200

    telegram = client.put(
        "/api/settings/telegram",
        json={"chatId": "12345", "botToken": "123456:test-token"},
    )
    assert telegram.status_code == 200

    published = client.post(f"/api/posts/{post['id']}/publish", json={"revision": 2})
    assert published.status_code == 200
    final_post = next(item for item in published.json()["state"]["posts"] if item["id"] == post["id"])
    assert final_post["status"] == "published"
    assert final_post["remoteId"] == "telegram-message-42"

    duplicate = client.post(f"/api/posts/{post['id']}/publish", json={"revision": 2})
    assert duplicate.status_code == 400


def test_local_telegram_polling_mode(client, monkeypatch) -> None:
    async def fake_connection(_token: str):
        return {"id": 1, "name": "@local_test_bot"}

    async def fake_delete(_token: str):
        return None

    async def fake_updates(*_args, **_kwargs):
        await asyncio.sleep(0.05)
        return []

    monkeypatch.setattr("app.main.test_connection", fake_connection)
    monkeypatch.setattr("app.main.delete_webhook", fake_delete)
    monkeypatch.setattr("app.poller.get_updates", fake_updates)

    started = client.put("/api/integrations/telegram/polling", json={"enabled": True})
    assert started.status_code == 200
    assert started.json()["state"]["telegram"]["pollingEnabled"] is True

    stopped = client.put("/api/integrations/telegram/polling", json={"enabled": False})
    assert stopped.status_code == 200
    assert stopped.json()["state"]["telegram"]["pollingEnabled"] is False


def test_durable_scheduler_is_idempotent_and_publishes_after_resume(client, monkeypatch) -> None:
    from app.schemas import GeneratedContent

    sequence = 0

    async def fake_generate(*_args, **_kwargs):
        nonlocal sequence
        sequence += 1
        return GeneratedContent(
            title=f"Scheduled draft {sequence}",
            body="A revision-bound scheduled post.",
            hashtags=["#scheduler"],
            rationale="Exercises durable local scheduling.",
        )

    async def fake_publish(*_args, **_kwargs):
        return "scheduled-message-99"

    monkeypatch.setattr("app.main.generate_content", fake_generate)
    monkeypatch.setattr("app.scheduler.publish_post", fake_publish)

    telegram = client.put(
        "/api/settings/telegram",
        json={"chatId": "12345", "botToken": "123456:scheduler-token"},
    )
    assert telegram.status_code == 200

    paused = client.put("/api/scheduler", json={"paused": True})
    assert paused.status_code == 200
    assert paused.json()["state"]["scheduler"]["paused"] is True

    def approved_post(topic: str) -> dict:
        generated = client.post(
            "/api/posts/generate",
            json={
                "topic": topic,
                "channel": "telegram",
                "tone": "Clear",
                "objective": "Test durable scheduling",
                "notifyTelegram": False,
            },
        ).json()["post"]
        decision = client.post(
            f"/api/posts/{generated['id']}/decision",
            json={"decision": "approve", "revision": generated["revision"]},
        )
        assert decision.status_code == 200
        return generated

    cancellable = approved_post("Schedule once")
    future = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    first = client.post(
        f"/api/posts/{cancellable['id']}/schedule",
        json={"revision": cancellable["revision"], "runAt": future},
    )
    duplicate = client.post(
        f"/api/posts/{cancellable['id']}/schedule",
        json={"revision": cancellable["revision"], "runAt": future},
    )
    assert first.status_code == 200
    assert first.json()["created"] is True
    assert duplicate.status_code == 200
    assert duplicate.json()["created"] is False
    assert duplicate.json()["job"]["id"] == first.json()["job"]["id"]

    cancelled = client.post(f"/api/jobs/{first.json()['job']['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["job"]["status"] == "cancelled"

    due = approved_post("Run after resume")
    scheduled = client.post(
        f"/api/posts/{due['id']}/schedule",
        json={"revision": due["revision"], "runAt": (datetime.now(UTC) - timedelta(seconds=1)).isoformat()},
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["job"]["status"] == "queued"

    resumed = client.put("/api/scheduler", json={"paused": False})
    assert resumed.status_code == 200

    deadline = time.monotonic() + 3
    final_state = resumed.json()["state"]
    while time.monotonic() < deadline:
        final_state = client.get("/api/state").json()
        final_post = next(post for post in final_state["posts"] if post["id"] == due["id"])
        if final_post["status"] == "published":
            break
        time.sleep(0.05)

    final_post = next(post for post in final_state["posts"] if post["id"] == due["id"])
    final_job = next(job for job in final_state["jobs"] if job["id"] == scheduled.json()["job"]["id"])
    assert final_post["status"] == "published"
    assert final_post["remoteId"] == "scheduled-message-99"
    assert final_job["status"] == "completed"
    assert final_job["attempts"] == 1
