# Roadmap

## Milestone 0 — product shell (current)

- [x] Localhost dashboard with responsive navigation.
- [x] Demo agent statuses, campaign KPIs, approval queue, and activity feed.
- [x] Interactive approve/reject and automation pause controls.
- [x] Health endpoint and repository/product documentation.
- [x] Native Node and loopback-only Docker packaging.
- [ ] Automated UI and accessibility tests.

## Milestone 1 — local content loop

- [ ] PostgreSQL schema, migrations, encrypted secret records, and audit events.
- [ ] Onboarding for workspace, brand, and campaign goal.
- [ ] Generic OpenAI-compatible provider plus Ollama adapter and model health test.
- [ ] Structured content generation with versioning and policy checks.
- [ ] Telegram approval buttons with signed callbacks and expiry.
- [ ] Telegram channel/webhook publisher for an end-to-end demonstrable action.
- [ ] Durable schedule, idempotency, retries, pause, and dry-run mode.

**Acceptance:** a fresh install can connect Ollama, generate a draft, approve it in Telegram, publish it exactly once, and inspect the complete audit trail.

## Milestone 2 — social publishing

- [ ] OAuth/account connection framework and scoped token vault.
- [ ] Meta Pages/Instagram professional account adapter.
- [ ] LinkedIn Posts adapter for users with approved access.
- [ ] Slack and WhatsApp Cloud approval adapters.
- [ ] Media processing, per-platform validation, calendar, and failure recovery.
- [ ] Normalized engagement metrics and experiment ledger.

**Acceptance:** edits invalidate approval; scheduled posts cannot publish twice; expired/revoked tokens produce actionable recovery steps.

## Milestone 3 — lead intelligence

- [ ] Google Places API adapter with attribution and retention enforcement.
- [ ] CSV/CRM import, deduplication, evidence, and suppression lists.
- [ ] Robots-aware public website crawler and business contact-page extraction.
- [ ] ICP scoring with explainable reason codes and manual correction.
- [ ] Approved provider SDK; no core LinkedIn scraper.
- [ ] Outreach draft review, export, consent/legal-basis, and retention tools.

## Milestone 4 — SEO lab

- [ ] Technical/on-page crawler and scheduled snapshots.
- [ ] Search Console and PageSpeed/Lighthouse adapters.
- [ ] Keyword map, content briefs, internal links, and cited recommendations.
- [ ] WordPress/Git fix proposals with diff, approval, and rollback.

## Milestone 5 — community platform

- [ ] Signed plugin packages and compatibility metadata.
- [ ] Workflow recipe gallery and portable workspace bundles.
- [ ] Authenticated multi-user/agency mode with RBAC.
- [ ] Backup/restore, observability, upgrade migrations, and security hardening.
- [ ] Contributor documentation, integration test harness, and release automation.
