from __future__ import annotations

import asyncio

import pytest

from app.errors import ExternalServiceError
from app.services import provider


@pytest.mark.parametrize(
    ("kind", "base_url", "expected_url", "expected_header"),
    [
        (
            "openai",
            "https://api.openai.com/v1",
            "https://api.openai.com/v1/models",
            ("Authorization", "Bearer test-key"),
        ),
        (
            "gemini",
            "https://generativelanguage.googleapis.com/v1beta/openai",
            "https://generativelanguage.googleapis.com/v1beta/openai/models",
            ("Authorization", "Bearer test-key"),
        ),
        (
            "anthropic",
            "https://api.anthropic.com/v1",
            "https://api.anthropic.com/v1/models",
            ("x-api-key", "test-key"),
        ),
        (
            "openrouter",
            "https://openrouter.ai/api/v1",
            "https://openrouter.ai/api/v1/models",
            ("Authorization", "Bearer test-key"),
        ),
        (
            "nvidia",
            "https://integrate.api.nvidia.com/v1",
            "https://integrate.api.nvidia.com/v1/models",
            ("Authorization", "Bearer test-key"),
        ),
    ],
)
def test_hosted_presets_use_exact_model_endpoints(
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
    base_url: str,
    expected_url: str,
    expected_header: tuple[str, str],
) -> None:
    calls: list[dict[str, object]] = []

    async def fake_request(url: str, **kwargs):
        calls.append({"url": url, **kwargs})
        return {"data": [{"id": "visible-model"}]}

    monkeypatch.setattr(provider, "_request_json", fake_request)
    result = asyncio.run(
        provider.test_provider(
            {"kind": kind, "base_url": base_url, "model": "visible-model", "api_key": "test-key"}
        )
    )

    assert result.ok is True
    assert result.models == ["visible-model"]
    assert calls[0]["url"] == expected_url
    headers = calls[0]["headers"]
    assert isinstance(headers, dict)
    assert headers[expected_header[0]] == expected_header[1]
    if kind == "anthropic":
        assert headers["anthropic-version"] == "2023-06-01"
        assert "Authorization" not in headers
    if kind == "openrouter":
        assert headers["X-Title"] == "Socium"


def test_hosted_preset_rejects_a_non_official_endpoint() -> None:
    with pytest.raises(ExternalServiceError, match="fixed official API endpoint"):
        provider.validate_provider_base_url("openai", "https://credential-capture.example/v1")


def test_anthropic_generation_uses_the_native_messages_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    async def fake_request(url: str, **kwargs):
        calls.append({"url": url, **kwargs})
        return {"content": [{"type": "text", "text": '{"title":"Ready"}'}]}

    monkeypatch.setattr(provider, "_request_json", fake_request)
    output = asyncio.run(
        provider._generate_json_text(
            {
                "kind": "anthropic",
                "base_url": "https://api.anthropic.com/v1",
                "model": "claude-sonnet-4-6",
                "api_key": "anthropic-key",
            },
            "Draft a post",
            system_prompt="Stay factual",
            temperature=0.5,
        )
    )

    assert output == '{"title":"Ready"}'
    assert calls[0]["url"] == "https://api.anthropic.com/v1/messages"
    headers = calls[0]["headers"]
    body = calls[0]["json_body"]
    assert isinstance(headers, dict)
    assert isinstance(body, dict)
    assert headers["x-api-key"] == "anthropic-key"
    assert headers["anthropic-version"] == "2023-06-01"
    assert body["system"] == "Stay factual"
    assert body["messages"] == [{"role": "user", "content": "Draft a post"}]
    assert all(message.get("role") != "system" for message in body["messages"])


def test_provider_settings_accept_local_auto_detection_and_presets(client) -> None:
    local = client.put(
        "/api/settings/provider",
        json={
            "kind": "ollama",
            "baseUrl": "http://127.0.0.1:11434",
            "model": "",
            "apiKey": "",
        },
    )
    assert local.status_code == 200
    assert local.json()["state"]["provider"]["configured"] is False

    hosted = client.put(
        "/api/settings/provider",
        json={
            "kind": "openai",
            "baseUrl": "https://api.openai.com/v1",
            "model": "gpt-5.6-luna",
            "apiKey": "encrypted-openai-key",
        },
    )
    assert hosted.status_code == 200
    public = hosted.json()["state"]["provider"]
    assert public == {
        "kind": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-5.6-luna",
        "hasApiKey": True,
        "configured": True,
        "updatedAt": public["updatedAt"],
    }

    rejected = client.put(
        "/api/settings/provider",
        json={
            "kind": "openai",
            "baseUrl": "https://credential-capture.example/v1",
            "model": "gpt-5.6-luna",
            "apiKey": "must-not-be-sent",
        },
    )
    assert rejected.status_code == 400
    assert "fixed official API endpoint" in rejected.json()["error"]
