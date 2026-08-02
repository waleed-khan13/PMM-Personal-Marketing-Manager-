from __future__ import annotations

from typing import Any

from app.connectors.base import ConnectorField, ConnectorManifest, ConnectorTestResult
from app.services.google_places import search_google_places


class GooglePlacesAdapter:
    manifest = ConnectorManifest(
        adapter_id="google-places",
        name="Google Places",
        description="Official Places API discovery with transient attributed results; Maps HTML is never scraped.",
        availability="available",
        capabilities=("leads",),
        config_fields=(
            ConnectorField(
                key="region_code",
                label="Region code",
                required=False,
                placeholder="PK",
                help_text="Optional two-letter country/region code used to format and bias results.",
            ),
            ConnectorField(
                key="language_code",
                label="Language code",
                required=False,
                placeholder="en",
                help_text="Optional language code for returned place content.",
            ),
        ),
        secret_fields=(
            ConnectorField(
                key="api_key",
                label="Google Maps API key",
                required=True,
                placeholder="AIza…",
                help_text="Restricted key with Places API (New) enabled. It stays encrypted locally.",
            ),
        ),
        allowed_scopes=("places:search",),
        required_scopes=("places:search",),
        docs_url="https://developers.google.com/maps/documentation/places/web-service/get-api-key",
    )

    async def test_connection(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
    ) -> ConnectorTestResult:
        results = await search_google_places(
            secrets.get("api_key", ""),
            "Google Sydney",
            page_size=1,
            language_code=str(config.get("language_code") or ""),
            region_code=str(config.get("region_code") or ""),
            field_mask="places.id",
        )
        if not results or not str(results[0].get("placeId") or ""):
            return ConnectorTestResult(ok=False, message="Google Places returned no test place ID.")
        return ConnectorTestResult(
            ok=True,
            message="Google Places API key verified with an ID-only request.",
            remote_account_id="places-api-new",
            details={"mode": "transient-search", "storage": "place-id-only"},
        )
