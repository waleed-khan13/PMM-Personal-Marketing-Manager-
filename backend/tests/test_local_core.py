from __future__ import annotations

import asyncio
import json
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


def test_slack_approval_message_buttons_are_revision_bound(monkeypatch) -> None:
    captured: dict = {}

    async def fake_request(_token: str, method: str, body: dict, **_kwargs):
        captured["method"] = method
        captured["body"] = body
        return {"ok": True, "ts": "1712345678.000200"}

    monkeypatch.setattr("app.services.slack.slack_request", fake_request)
    from app.services.slack import send_approval_message

    message_ts = asyncio.run(
        send_approval_message(
            "xoxb-test",
            "C1234567890",
            {
                "id": "post-123",
                "revision": 7,
                "channel": "linkedin",
                "title": "A safe review title",
                "body": "Review this exact content.",
                "hashtags": ["#local"],
            },
        )
    )
    assert message_ts == "1712345678.000200"
    assert captured["method"] == "chat.postMessage"
    assert captured["body"]["channel"] == "C1234567890"
    actions = captured["body"]["blocks"][-1]["elements"]
    assert actions[0]["value"] == "lg:approve:post-123:7"
    assert actions[1]["value"] == "lg:reject:post-123:7"


def test_connector_vault_redacts_secrets_and_validates_slack(client, monkeypatch) -> None:
    from app.connectors.base import ConnectorTestResult
    from app.schemas import GeneratedContent

    catalog = client.get("/api/connectors")
    assert catalog.status_code == 200
    slack_manifest = next(item for item in catalog.json()["catalog"] if item["adapterId"] == "slack")
    assert slack_manifest["availability"] == "available"
    assert set(slack_manifest["requiredScopes"]) == {"chat:write", "connections:write"}

    invalid = client.post(
        "/api/connectors",
        json={
            "adapterId": "slack",
            "name": "Missing scope",
            "config": {"approval_channel_id": "C0123456789"},
            "secrets": {"bot_token": "xoxb-invalid", "app_token": "xapp-invalid"},
            "scopes": ["chat:write"],
        },
    )
    assert invalid.status_code == 400
    assert "connections:write" in invalid.json()["error"]

    bot_token = "xoxb-local-connector-secret"
    app_token = "xapp-local-socket-secret"
    created = client.post(
        "/api/connectors",
        json={
            "adapterId": "slack",
            "name": "Approvals workspace",
            "config": {"approval_channel_id": "C0123456789"},
            "secrets": {"bot_token": bot_token, "app_token": app_token},
            "scopes": ["chat:write", "connections:write"],
            "enabled": True,
        },
    )
    assert created.status_code == 200
    account = created.json()["account"]
    account_id = account["id"]
    assert account["secretStatus"] == {"bot_token": True, "app_token": True}
    assert bot_token not in created.text
    assert app_token not in created.text

    from app.config import get_settings

    with sqlite3.connect(get_settings().database_path) as connection:
        encrypted = connection.execute(
            "SELECT encrypted_secrets FROM connector_accounts WHERE id = ?",
            (account_id,),
        ).fetchone()[0]
    assert bot_token not in encrypted
    assert app_token not in encrypted

    updated = client.put(
        f"/api/connectors/{account_id}",
        json={
            "adapterId": "slack",
            "name": "Approvals workspace",
            "config": {"approval_channel_id": "C9876543210"},
            "secrets": {},
            "scopes": ["chat:write", "connections:write"],
            "enabled": True,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["account"]["secretStatus"] == {"bot_token": True, "app_token": True}

    async def fake_slack_test(_self, config, secrets):
        assert config["approval_channel_id"] == "C9876543210"
        assert secrets == {"bot_token": bot_token, "app_token": app_token}
        return ConnectorTestResult(
            ok=True,
            message="Connected to Slack workspace Test team.",
            remote_account_id="T123456",
            details={"team": "Test team", "socketMode": "ready"},
        )

    monkeypatch.setattr("app.connectors.slack.SlackAdapter.test_connection", fake_slack_test)
    tested = client.post(f"/api/connectors/{account_id}/test")
    assert tested.status_code == 200
    assert tested.json()["remoteAccountId"] == "T123456"
    verified = next(
        item for item in tested.json()["state"]["connectors"]["accounts"] if item["id"] == account_id
    )
    assert verified["status"] == "verified"
    assert verified["listener"] == {"active": False, "status": "stopped", "lastError": None}

    provider = client.put(
        "/api/settings/provider",
        json={
            "kind": "openai-compatible",
            "baseUrl": "https://provider.example/v1",
            "model": "test-model",
            "apiKey": "provider-test-key",
        },
    )
    assert provider.status_code == 200

    async def fake_generate(*_args, **_kwargs):
        return GeneratedContent(
            title="Slack review",
            body="A revision-bound Slack approval draft.",
            hashtags=["#slack"],
            rationale="Exercises Socket Mode approval rules.",
        )

    sent_posts: list[dict] = []

    async def fake_slack_send(_token: str, channel_id: str, post: dict):
        assert channel_id == "C9876543210"
        sent_posts.append(post)
        return "1712345678.000100"

    monkeypatch.setattr("app.main.generate_content", fake_generate)
    monkeypatch.setattr("app.connectors.service.send_approval_message", fake_slack_send)
    generated = client.post(
        "/api/posts/generate",
        json={
            "topic": "Slack workflow",
            "channel": "linkedin",
            "tone": "Clear",
            "objective": "Review the workflow",
            "notifyTelegram": False,
            "notifySlack": True,
        },
    )
    assert generated.status_code == 200
    post = generated.json()["post"]
    assert generated.json()["notifications"] == [
        {"channel": "slack", "ok": True, "message": "Approval request sent to Slack."}
    ]
    assert sent_posts[0]["id"] == post["id"]

    resent = client.post(
        f"/api/posts/{post['id']}/approvals/slack",
        json={"revision": post["revision"]},
    )
    assert resent.status_code == 200
    assert resent.json()["delivery"]["messageTs"] == "1712345678.000100"

    from app.slack_listener import process_slack_interaction

    interaction = {
        "type": "block_actions",
        "channel": {"id": "C0000000000"},
        "user": {"id": "U123456"},
        "actions": [
            {
                "action_id": "localgrowth_approve",
                "value": f"lg:approve:{post['id']}:{post['revision']}",
            }
        ],
    }
    unauthorized = process_slack_interaction(interaction, "C9876543210")
    assert unauthorized is not None
    assert "not authorized" in unauthorized.message
    pending = next(item for item in client.get("/api/state").json()["posts"] if item["id"] == post["id"])
    assert pending["status"] == "pending"

    interaction["channel"] = {"id": "C9876543210"}

    class FakeSocket:
        def __init__(self) -> None:
            self.sent: list[str] = []

        async def send(self, message: str) -> None:
            self.sent.append(message)

    socket = FakeSocket()
    feedback: list[str] = []

    async def fake_feedback(_token: str, _channel: str, _user: str, message: str) -> None:
        assert socket.sent == ['{"envelope_id": "env-1"}']
        feedback.append(message)

    monkeypatch.setattr("app.slack_listener.send_decision_feedback", fake_feedback)
    from app.slack_listener import SlackSocketListener

    listener = SlackSocketListener(enabled=False)
    reconnect = asyncio.run(
        listener._handle_envelope(
            socket,  # type: ignore[arg-type]
            json.dumps(
                {
                    "envelope_id": "env-1",
                    "type": "interactive",
                    "payload": interaction,
                }
            ),
            bot_token,
            "C9876543210",
            account_id,
        )
    )
    assert reconnect is False
    assert feedback == ["Revision 1 approved and locked."]
    approved = next(item for item in client.get("/api/state").json()["posts"] if item["id"] == post["id"])
    assert approved["status"] == "approved"
    repeated = process_slack_interaction(interaction, "C9876543210")
    assert repeated is not None
    assert "Current status: approved" in repeated.message
    assert any(
        event["action"] == "post.approved.slack"
        for event in client.get("/api/state").json()["audit"]
    )

    removed = client.delete(f"/api/connectors/{account_id}")
    assert removed.status_code == 200
    assert all(item["id"] != account_id for item in removed.json()["state"]["connectors"]["accounts"])
