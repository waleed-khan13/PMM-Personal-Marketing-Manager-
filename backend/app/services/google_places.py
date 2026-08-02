from __future__ import annotations

import re
from typing import Any

import httpx

from app.errors import AppError, ExternalServiceError

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DISCOVERY_FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.websiteUri,"
    "places.internationalPhoneNumber,places.googleMapsUri,places.attributions"
)
REGION_CODE_PATTERN = re.compile(r"^[A-Za-z]{2}$")
LANGUAGE_CODE_PATTERN = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")


def _error_message(payload: object, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and str(error.get("message") or "").strip():
            return str(error["message"]).strip()
    return f"Google Places returned HTTP {status_code}."


def _place_result(place: dict[str, Any]) -> dict[str, object]:
    display_name = place.get("displayName")
    name = str(display_name.get("text") or "").strip() if isinstance(display_name, dict) else ""
    raw_attributions = place.get("attributions")
    attributions: list[dict[str, str]] = []
    if isinstance(raw_attributions, list):
        for item in raw_attributions:
            if not isinstance(item, dict):
                continue
            provider = str(item.get("provider") or "").strip()
            provider_uri = str(item.get("providerUri") or "").strip()
            if provider:
                attributions.append({"provider": provider, "providerUri": provider_uri})
    return {
        "placeId": str(place.get("id") or "").strip(),
        "name": name,
        "address": str(place.get("formattedAddress") or "").strip(),
        "website": str(place.get("websiteUri") or "").strip(),
        "phone": str(place.get("internationalPhoneNumber") or "").strip(),
        "googleMapsUri": str(place.get("googleMapsUri") or "").strip(),
        "attributions": attributions,
    }


async def search_google_places(
    api_key: str,
    query: str,
    *,
    page_size: int = 10,
    language_code: str = "",
    region_code: str = "",
    field_mask: str = DISCOVERY_FIELD_MASK,
) -> list[dict[str, object]]:
    if not api_key.strip():
        raise ExternalServiceError("Google Places API key is required.")
    if region_code.strip() and not REGION_CODE_PATTERN.fullmatch(region_code.strip()):
        raise AppError("Google Places region code must contain two letters.")
    if language_code.strip() and not LANGUAGE_CODE_PATTERN.fullmatch(language_code.strip()):
        raise AppError("Google Places language code is invalid.")
    body: dict[str, object] = {"textQuery": query.strip(), "pageSize": page_size}
    if language_code.strip():
        body["languageCode"] = language_code.strip()
    if region_code.strip():
        body["regionCode"] = region_code.strip().upper()
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.post(
                TEXT_SEARCH_URL,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": api_key.strip(),
                    "X-Goog-FieldMask": field_mask,
                },
                json=body,
            )
    except httpx.HTTPError as error:
        raise ExternalServiceError(f"Google Places request failed ({type(error).__name__}).") from error
    try:
        payload = response.json()
    except ValueError as error:
        raise ExternalServiceError(
            f"Google Places returned a non-JSON response ({response.status_code})."
        ) from error
    if not response.is_success:
        raise ExternalServiceError(_error_message(payload, response.status_code))
    if not isinstance(payload, dict) or not isinstance(payload.get("places", []), list):
        raise ExternalServiceError("Google Places returned an invalid response.")
    return [_place_result(place) for place in payload.get("places", []) if isinstance(place, dict)]
