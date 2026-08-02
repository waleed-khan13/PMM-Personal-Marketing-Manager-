from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

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
