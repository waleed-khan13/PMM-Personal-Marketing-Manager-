from __future__ import annotations

import base64
import binascii
import time
from dataclasses import dataclass
from typing import Any

from app.errors import ExternalServiceError
from app.schemas import ImageGenerateRequest, ProviderConnectionResult
from app.services.provider import _openai_endpoint, _request_json, validate_base_url

MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024
MAX_ENCODED_IMAGE_LENGTH = ((MAX_GENERATED_IMAGE_BYTES + 2) // 3) * 4 + 128

OPENAI_SIZES = {
    "square": "1024x1024",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
}
A1111_SIZES = {
    "square": (1024, 1024),
    "portrait": (896, 1152),
    "landscape": (1152, 896),
}


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    provider_kind: str
    model: str
    parameters: dict[str, Any]


def validate_image_base_url(value: str) -> str:
    return validate_base_url(value)


def _headers(api_key: str, provider_kind: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        if provider_kind == "automatic1111" and ":" in api_key:
            encoded = base64.b64encode(api_key.encode("utf-8")).decode("ascii")
            headers["Authorization"] = f"Basic {encoded}"
        else:
            headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _decode_image(value: object) -> bytes:
    if not isinstance(value, str) or not value:
        raise ExternalServiceError("Image provider response did not include image data.")
    encoded = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    if len(encoded) > MAX_ENCODED_IMAGE_LENGTH:
        raise ExternalServiceError("Generated image is larger than the 10 MB local media limit.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ExternalServiceError("Image provider returned invalid base64 image data.") from error
    if not data:
        raise ExternalServiceError("Image provider returned an empty image.")
    if len(data) > MAX_GENERATED_IMAGE_BYTES:
        raise ExternalServiceError("Generated image is larger than the 10 MB local media limit.")
    return data


async def test_image_provider(settings: dict[str, str]) -> ProviderConnectionResult:
    started = time.monotonic()
    try:
        headers = _headers(settings["api_key"], settings["kind"])
        if settings["kind"] == "automatic1111":
            payload = await _request_json(
                f"{validate_image_base_url(settings['base_url'])}/sdapi/v1/options",
                headers=headers,
            )
            current_model = str(payload.get("sd_model_checkpoint") or "").strip()
            models = [current_model] if current_model else []
            message = "Automatic1111 / Forge API connected."
        else:
            payload = await _request_json(
                _openai_endpoint(settings["base_url"], "models"),
                headers=headers,
            )
            raw_models = payload.get("data") if isinstance(payload.get("data"), list) else []
            models = [
                str(item.get("id")) for item in raw_models if isinstance(item, dict) and item.get("id")
            ][:100]
            message = "OpenAI-compatible Images API connected."
        return ProviderConnectionResult(
            ok=True,
            message=message,
            models=models,
            latency_ms=round((time.monotonic() - started) * 1_000),
        )
    except ExternalServiceError as error:
        return ProviderConnectionResult(
            ok=False,
            message=error.message,
            latency_ms=round((time.monotonic() - started) * 1_000),
        )


async def generate_image(
    settings: dict[str, str], request: ImageGenerateRequest
) -> GeneratedImage:
    headers = _headers(settings["api_key"], settings["kind"])
    if settings["kind"] == "automatic1111":
        width, height = A1111_SIZES[request.preset]
        model = settings["model"] or "active-checkpoint"
        body: dict[str, Any] = {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "width": width,
            "height": height,
            "steps": request.steps,
            "cfg_scale": request.guidance_scale,
            "seed": request.seed,
            "batch_size": 1,
            "n_iter": 1,
        }
        if settings["model"]:
            body["override_settings"] = {"sd_model_checkpoint": settings["model"]}
            body["override_settings_restore_afterwards"] = True
        payload = await _request_json(
            f"{validate_image_base_url(settings['base_url'])}/sdapi/v1/txt2img",
            method="POST",
            headers=headers,
            json_body=body,
            timeout=300,
        )
        images = payload.get("images") if isinstance(payload.get("images"), list) else []
        encoded = images[0] if images else None
        parameters = {
            "preset": request.preset,
            "width": width,
            "height": height,
            "steps": request.steps,
            "guidanceScale": request.guidance_scale,
            "seed": request.seed,
        }
    else:
        if not settings["model"]:
            raise ExternalServiceError("Choose an image model before generating.")
        size = OPENAI_SIZES[request.preset]
        body = {
            "model": settings["model"],
            "prompt": request.prompt,
            "n": 1,
            "size": size,
            "quality": request.quality,
            "output_format": "png",
        }
        payload = await _request_json(
            _openai_endpoint(settings["base_url"], "images/generations"),
            method="POST",
            headers=headers,
            json_body=body,
            timeout=300,
        )
        results = payload.get("data") if isinstance(payload.get("data"), list) else []
        first = results[0] if results and isinstance(results[0], dict) else {}
        encoded = first.get("b64_json")
        model = settings["model"]
        parameters = {
            "preset": request.preset,
            "size": size,
            "quality": request.quality,
            "outputFormat": "png",
        }
    return GeneratedImage(
        data=_decode_image(encoded),
        provider_kind=settings["kind"],
        model=model,
        parameters=parameters,
    )
