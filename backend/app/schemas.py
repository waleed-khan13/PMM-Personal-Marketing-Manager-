from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


class WorkspaceUpdate(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    business_name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2_000)
    timezone: str = Field(default="Asia/Karachi", max_length=80)


class ProviderUpdate(ApiModel):
    kind: Literal["ollama", "openai-compatible"]
    base_url: str = Field(min_length=1, max_length=2_048)
    model: str = Field(min_length=1, max_length=180)
    api_key: str = Field(default="", max_length=2_000)


class TelegramUpdate(ApiModel):
    chat_id: str = Field(min_length=1, max_length=160)
    bot_token: str = Field(default="", max_length=2_000)


class PollingUpdate(ApiModel):
    enabled: bool


class GeneratePostRequest(ApiModel):
    topic: str = Field(min_length=1, max_length=1_000)
    channel: Literal["linkedin", "instagram", "facebook", "x", "telegram", "blog"]
    tone: str = Field(default="Clear and confident", max_length=160)
    objective: str = Field(default="Build useful awareness", max_length=500)
    notify_telegram: bool = True


class EditPostRequest(ApiModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=12_000)
    hashtags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("hashtags")
    @classmethod
    def validate_hashtags(cls, hashtags: list[str]) -> list[str]:
        cleaned = [tag.strip()[:80] for tag in hashtags if tag.strip()]
        return cleaned[:20]


class DecisionRequest(ApiModel):
    decision: Literal["approve", "reject"]
    revision: int = Field(ge=1)


class PublishRequest(ApiModel):
    revision: int = Field(ge=1)


class SchedulePostRequest(ApiModel):
    revision: int = Field(ge=1)
    run_at: datetime

    @field_validator("run_at")
    @classmethod
    def require_timezone(cls, run_at: datetime) -> datetime:
        if run_at.tzinfo is None or run_at.utcoffset() is None:
            raise ValueError("runAt must include a timezone offset.")
        return run_at.astimezone(UTC)


class SchedulerUpdate(ApiModel):
    paused: bool


class ConnectorAccountUpsert(ApiModel):
    adapter_id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,79}$")
    name: str = Field(min_length=1, max_length=120)
    config: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, str] = Field(default_factory=dict)
    scopes: list[str] = Field(default_factory=list, max_length=30)
    enabled: bool = True

    @field_validator("config")
    @classmethod
    def validate_config(cls, config: dict[str, Any]) -> dict[str, Any]:
        if len(config) > 30:
            raise ValueError("Connector config has too many fields.")
        return config

    @field_validator("secrets")
    @classmethod
    def validate_secrets(cls, secrets: dict[str, str]) -> dict[str, str]:
        if len(secrets) > 20:
            raise ValueError("Connector secret payload has too many fields.")
        cleaned: dict[str, str] = {}
        for key, value in secrets.items():
            clean_key = key.strip()
            if not clean_key or len(clean_key) > 80 or len(value) > 8_000:
                raise ValueError("Connector secret field is invalid.")
            if value.strip():
                cleaned[clean_key] = value.strip()
        return cleaned

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, scopes: list[str]) -> list[str]:
        cleaned = sorted({scope.strip() for scope in scopes if scope.strip()})
        if any(len(scope) > 120 for scope in cleaned):
            raise ValueError("Connector scope is too long.")
        return cleaned


class GeneratedContent(ApiModel):
    title: str
    body: str
    hashtags: list[str] = Field(default_factory=list)
    rationale: str = ""


class ProviderConnectionResult(ApiModel):
    ok: bool
    message: str
    models: list[str] | None = None
    latency_ms: int | None = None
