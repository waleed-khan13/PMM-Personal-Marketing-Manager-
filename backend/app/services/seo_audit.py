from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Iterable
from html.parser import HTMLParser
from time import perf_counter
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from app.errors import AppError
from app.services.crawler import (
    MAX_PAGE_BYTES,
    USER_AGENT,
    read_public_page,
    robots_policy,
    validate_public_url,
)

SEO_AUDIT_LOCK = asyncio.Lock()
WORD_PATTERN = re.compile(r"\b[\w'-]+\b", re.UNICODE)


def _clean_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _json_ld_types(value: object) -> list[str]:
    found: list[str] = []
    if isinstance(value, list):
        for item in value:
            found.extend(_json_ld_types(item))
        return found
    if not isinstance(value, dict):
        return found
    kind = value.get("@type")
    if isinstance(kind, list):
        found.extend(str(item) for item in kind if item)
    elif kind:
        found.append(str(kind))
    graph = value.get("@graph")
    if graph is not None:
        found.extend(_json_ld_types(graph))
    return found


class SeoPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.language = ""
        self.charset = ""
        self.viewport = ""
        self.robots = ""
        self.og_title = ""
        self.og_description = ""
        self.og_image = ""
        self.h1s: list[str] = []
        self.h2s: list[str] = []
        self.links: list[str] = []
        self.image_count = 0
        self.images_missing_alt = 0
        self.structured_data_types: list[str] = []
        self._capture: str | None = None
        self._buffer: list[str] = []
        self._ignored_depth = 0
        self._json_ld = False
        self._visible_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.casefold()
        attributes = {key.casefold(): value or "" for key, value in attrs}
        if lowered == "html" and not self.language:
            self.language = _clean_text(attributes.get("lang", ""))[:40]
        if lowered == "script" and attributes.get("type", "").casefold() == "application/ld+json":
            self._json_ld = True
            self._capture = "json-ld"
            self._buffer = []
            return
        if lowered in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1
            return
        if lowered in {"title", "h1", "h2"}:
            self._capture = lowered
            self._buffer = []
        elif lowered == "meta":
            name = (attributes.get("name") or attributes.get("property") or "").casefold()
            content = _clean_text(attributes.get("content", ""))
            if attributes.get("charset") and not self.charset:
                self.charset = attributes["charset"].strip()[:40]
            if name == "description" and not self.description:
                self.description = content
            elif name == "viewport" and not self.viewport:
                self.viewport = content
            elif name == "robots" and not self.robots:
                self.robots = content
            elif name == "og:title" and not self.og_title:
                self.og_title = content
            elif name == "og:description" and not self.og_description:
                self.og_description = content
            elif name == "og:image" and not self.og_image:
                self.og_image = content
        elif lowered == "link":
            rel = {item.casefold() for item in attributes.get("rel", "").split()}
            if "canonical" in rel and not self.canonical:
                self.canonical = attributes.get("href", "").strip()
        elif lowered == "a":
            href = attributes.get("href", "").strip()
            if href:
                self.links.append(href)
        elif lowered == "img":
            self.image_count += 1
            if not attributes.get("alt", "").strip():
                self.images_missing_alt += 1

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.casefold()
        if lowered == "script" and self._json_ld:
            raw = "".join(self._buffer).strip()
            self._capture = None
            self._buffer = []
            self._json_ld = False
            try:
                payload = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return
            self.structured_data_types.extend(_json_ld_types(payload))
            return
        if lowered in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1
            return
        if self._capture != lowered:
            return
        value = _clean_text(" ".join(self._buffer))
        if lowered == "title" and not self.title:
            self.title = value
        elif lowered == "h1" and value:
            self.h1s.append(value)
        elif lowered == "h2" and value:
            self.h2s.append(value)
        self._capture = None
        self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)
        elif not self._ignored_depth and _clean_text(data):
            self._visible_text.append(data)

    @property
    def visible_text(self) -> str:
        return _clean_text(" ".join(self._visible_text))[:500_000]


def _link_counts(page_url: str, values: Iterable[str]) -> tuple[int, int]:
    host = (urlsplit(page_url).hostname or "").casefold().removeprefix("www.")
    internal: set[str] = set()
    external: set[str] = set()
    for raw in values:
        candidate = urljoin(page_url, raw)
        parsed = urlsplit(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            continue
        target_host = parsed.hostname.casefold().removeprefix("www.")
        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path or '/'}"
        (internal if target_host == host else external).add(clean)
    return len(internal), len(external)


def _status_for_range(value: int, ideal_min: int, ideal_max: int, *, missing_fails: bool = True) -> str:
    if value == 0 and missing_fails:
        return "failed"
    if ideal_min <= value <= ideal_max:
        return "passed"
    return "warning"


def _check(
    code: str,
    label: str,
    category: str,
    status: str,
    evidence: str,
    recommendation: str,
    weight: int,
    *,
    severity: str | None = None,
) -> dict[str, Any]:
    resolved_severity = severity or (
        "info" if status == "passed" else "high" if status == "failed" else "medium"
    )
    return {
        "code": code,
        "label": label,
        "category": category,
        "status": status,
        "severity": resolved_severity,
        "evidence": evidence,
        "recommendation": "" if status == "passed" else recommendation,
        "weight": weight,
    }


def _scores(checks: list[dict[str, Any]]) -> tuple[int, dict[str, int]]:
    factors = {"passed": 1.0, "warning": 0.5, "failed": 0.0}

    def calculate(items: list[dict[str, Any]]) -> int:
        possible = sum(int(item["weight"]) for item in items)
        earned = sum(int(item["weight"]) * factors[str(item["status"])] for item in items)
        return round((earned / possible) * 100) if possible else 0

    categories = {
        "technical": calculate([item for item in checks if item["category"] == "technical"]),
        "onPage": calculate([item for item in checks if item["category"] == "onPage"]),
        "content": calculate([item for item in checks if item["category"] == "content"]),
        "social": calculate([item for item in checks if item["category"] == "social"]),
    }
    return calculate(checks), categories


def analyze_seo_document(
    *,
    requested_url: str,
    final_url: str,
    status_code: int,
    content_type: str,
    headers: dict[str, str],
    content: bytes,
    duration_ms: int,
    robots_respected: bool,
) -> dict[str, Any]:
    parser = SeoPageParser()
    if content:
        parser.feed(content.decode("utf-8", errors="replace"))
    text = parser.visible_text
    word_count = len(WORD_PATTERN.findall(text))
    internal_links, external_links = _link_counts(final_url, parser.links)
    response_robots = headers.get("x-robots-tag", "")
    directives = {
        item.strip().casefold() for item in f"{parser.robots},{response_robots}".split(",") if item.strip()
    }
    indexable = "noindex" not in directives and status_code == 200
    canonical = urljoin(final_url, parser.canonical) if parser.canonical else ""
    content_type_header = headers.get("content-type", "")
    has_charset = bool(parser.charset or "charset=" in content_type_header.casefold())
    title_length = len(parser.title)
    description_length = len(parser.description)
    missing_alt_ratio = parser.images_missing_alt / parser.image_count if parser.image_count else 0.0
    structured_types = list(dict.fromkeys(parser.structured_data_types))[:20]

    checks: list[dict[str, Any]] = []
    checks.append(
        _check(
            "http-status",
            "Successful HTTP response",
            "technical",
            "passed" if status_code == 200 else "failed",
            f"HTTP {status_code}",
            "Return a stable HTTP 200 response for the canonical page.",
            12,
        )
    )
    checks.append(
        _check(
            "https",
            "HTTPS transport",
            "technical",
            "passed" if urlsplit(final_url).scheme == "https" else "failed",
            urlsplit(final_url).scheme.upper(),
            "Serve the page over HTTPS and redirect HTTP consistently.",
            8,
        )
    )
    checks.append(
        _check(
            "indexable",
            "Indexing directives",
            "technical",
            "passed" if indexable else "failed",
            "Indexable" if indexable else f"Blocked by {', '.join(sorted(directives)) or 'HTTP status'}",
            "Remove accidental noindex directives and verify the page returns HTTP 200.",
            12,
        )
    )
    checks.append(
        _check(
            "viewport",
            "Mobile viewport",
            "technical",
            "passed" if parser.viewport else "warning",
            parser.viewport or "Missing viewport meta tag",
            "Add a responsive viewport meta tag.",
            5,
        )
    )
    checks.append(
        _check(
            "canonical",
            "Canonical URL",
            "technical",
            "passed" if canonical else "warning",
            canonical or "No canonical link found",
            "Add a self-referencing canonical URL to reduce duplicate ambiguity.",
            6,
        )
    )
    speed_status = "passed" if duration_ms <= 2_000 else "warning" if duration_ms <= 4_000 else "failed"
    checks.append(
        _check(
            "response-time",
            "Crawler response time",
            "technical",
            speed_status,
            f"{duration_ms} ms",
            "Reduce server response time; validate with PageSpeed or Lighthouse before shipping a fix.",
            7,
        )
    )
    size_status = "passed" if len(content) <= 500_000 else "warning"
    checks.append(
        _check(
            "html-size",
            "HTML transfer size",
            "technical",
            size_status,
            f"{len(content):,} bytes",
            "Reduce initial HTML size and defer non-critical payloads.",
            4,
        )
    )
    checks.append(
        _check(
            "charset",
            "Character encoding",
            "technical",
            "passed" if has_charset else "warning",
            parser.charset or content_type_header or "No charset declared",
            "Declare UTF-8 in the response Content-Type or HTML head.",
            3,
        )
    )
    checks.append(
        _check(
            "language",
            "Document language",
            "technical",
            "passed" if parser.language else "warning",
            parser.language or "Missing html lang attribute",
            "Set the html lang attribute for accessibility and search engines.",
            2,
        )
    )
    checks.append(
        _check(
            "structured-data",
            "Structured data",
            "technical",
            "passed" if structured_types else "warning",
            ", ".join(structured_types) or "No valid JSON-LD type found",
            "Add relevant, truthful JSON-LD and validate it before publishing.",
            4,
        )
    )

    checks.append(
        _check(
            "title",
            "Title tag",
            "onPage",
            _status_for_range(title_length, 30, 60),
            f"{title_length} characters · {parser.title or 'missing'}",
            "Write a unique, descriptive title around 30–60 characters.",
            10,
        )
    )
    checks.append(
        _check(
            "meta-description",
            "Meta description",
            "onPage",
            _status_for_range(description_length, 70, 160),
            f"{description_length} characters",
            "Write a useful, page-specific description around 70–160 characters.",
            8,
        )
    )
    h1_status = "passed" if len(parser.h1s) == 1 else "failed" if not parser.h1s else "warning"
    checks.append(
        _check(
            "h1",
            "Primary heading",
            "onPage",
            h1_status,
            f"{len(parser.h1s)} H1 element(s)",
            "Use one clear H1 that describes the page's primary topic.",
            8,
        )
    )

    h2_status = "passed" if parser.h2s else "warning"
    checks.append(
        _check(
            "h2",
            "Section heading structure",
            "content",
            h2_status,
            f"{len(parser.h2s)} H2 element(s)",
            "Use descriptive H2 headings to structure substantial sections.",
            3,
        )
    )
    words_status = "passed" if word_count >= 300 else "warning" if word_count >= 100 else "failed"
    checks.append(
        _check(
            "word-count",
            "Indexable page copy",
            "content",
            words_status,
            f"{word_count:,} visible words",
            "Add original, useful copy that answers the visitor's intent; avoid filler and keyword stuffing.",
            8,
        )
    )
    alt_status = (
        "passed" if parser.images_missing_alt == 0 else "warning" if missing_alt_ratio < 0.5 else "failed"
    )
    checks.append(
        _check(
            "image-alt",
            "Image alternative text",
            "content",
            alt_status,
            f"{parser.images_missing_alt} of {parser.image_count} images missing alt text",
            "Add concise alt text to meaningful images and empty alt attributes to decorative images.",
            6,
        )
    )
    internal_status = "passed" if internal_links >= 3 else "warning" if internal_links else "failed"
    checks.append(
        _check(
            "internal-links",
            "Internal discovery links",
            "content",
            internal_status,
            f"{internal_links} internal · {external_links} external",
            "Add contextual links to useful related pages using descriptive anchor text.",
            4,
        )
    )
    social_fields = sum(bool(item) for item in (parser.og_title, parser.og_description, parser.og_image))
    social_status = "passed" if social_fields == 3 else "warning" if social_fields else "failed"
    checks.append(
        _check(
            "open-graph",
            "Social share metadata",
            "social",
            social_status,
            f"{social_fields} of 3 core Open Graph fields",
            "Add accurate og:title, og:description, and og:image metadata.",
            5,
            severity=(
                None if social_status == "passed" else "low" if social_status == "warning" else "medium"
            ),
        )
    )

    overall_score, category_scores = _scores(checks)
    return {
        "requestedUrl": requested_url,
        "finalUrl": final_url,
        "hostname": (urlsplit(final_url).hostname or "").casefold(),
        "statusCode": status_code,
        "overallScore": overall_score,
        "scores": category_scores,
        "metrics": {
            "title": parser.title,
            "titleLength": title_length,
            "description": parser.description,
            "descriptionLength": description_length,
            "canonicalUrl": canonical,
            "language": parser.language,
            "h1Count": len(parser.h1s),
            "h2Count": len(parser.h2s),
            "wordCount": word_count,
            "imageCount": parser.image_count,
            "imagesMissingAlt": parser.images_missing_alt,
            "internalLinks": internal_links,
            "externalLinks": external_links,
            "structuredDataTypes": structured_types,
            "htmlBytes": len(content),
            "indexable": indexable,
            "passedChecks": sum(item["status"] == "passed" for item in checks),
            "warningChecks": sum(item["status"] == "warning" for item in checks),
            "failedChecks": sum(item["status"] == "failed" for item in checks),
        },
        "checks": checks,
        "robotsRespected": robots_respected,
        "userAgent": USER_AGENT,
        "durationMs": duration_ms,
        "contentType": content_type,
    }


async def audit_website(value: str) -> dict[str, Any]:
    async with SEO_AUDIT_LOCK:
        started = perf_counter()
        start_url = await validate_public_url(value)
        timeout = httpx.Timeout(20, connect=8)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            robots, _delay = await robots_policy(client, start_url)
            if not robots.can_fetch("Socium", start_url):
                raise AppError("Website robots.txt does not allow this page to be audited.", 403)
            response = await read_public_page(
                client,
                start_url,
                accepted_types=("text/html", "application/xhtml+xml"),
                max_bytes=MAX_PAGE_BYTES,
            )
        duration_ms = max(1, round((perf_counter() - started) * 1_000))
        return analyze_seo_document(
            requested_url=start_url,
            final_url=response.final_url,
            status_code=response.status_code,
            content_type=response.content_type,
            headers=response.headers,
            content=response.content,
            duration_ms=duration_ms,
            robots_respected=True,
        )
