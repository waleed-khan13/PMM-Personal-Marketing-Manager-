# Roadmap

LocalGrowth OS is a downloadable, open-source, localhost-only application. It is not a hosted SaaS product. Every core feature must work with data stored on the operator's own computer, and the application binds to loopback by default.

## Milestone 0 — working product shell

- [x] Responsive localhost dashboard with custom shadcn-based UI.
- [x] Workspace onboarding, provider setup, approval queue, and audit feed.
- [x] Ollama and generic OpenAI-compatible provider connections.
- [x] Structured content generation with revision-bound approval.
- [x] Telegram notifications and Telegram publishing.
- [x] Encrypted connector secrets and local persistence.
- [x] Native Node and loopback-only Docker packaging.
- [ ] Automated UI and accessibility tests.

## Milestone 1 — local application core (complete)

- [x] FastAPI service bound only to `127.0.0.1` or the private Compose network.
- [x] SQLite WAL database with SQLAlchemy models and Alembic migrations.
- [x] One-time import from the v0.2 JSON store without exposing saved secrets.
- [x] Next.js same-origin proxy so the browser exposes only port `3000`.
- [x] Telegram long-polling approvals with no public webhook or tunnel.
- [x] Persistent local jobs, retries, idempotency, pause, and catch-up rules for Telegram publishing.
- [x] Native launcher that starts the API, worker, and web console together.
- [x] Backend unit/integration tests and a real localhost browser smoke test.

**Acceptance:** a fresh install starts locally, connects Ollama or an API provider, generates a draft, receives a Telegram decision through long polling, publishes exactly once, survives a restart, and exposes the complete audit trail without any hosted LocalGrowth service.

## Milestone 2 — social publishing (current)

- [x] Local connector manifests, capability registry, CRUD API, and encrypted scoped multi-secret token vault.
- [x] Slack account configuration plus real bot identity and Socket Mode token health checks.
- [ ] Meta Pages/Instagram professional account adapter.
- [ ] LinkedIn Posts adapter for users with approved API access.
- [x] Slack Socket Mode approval listener, outbound Block Kit requests, and version-bound interactive decisions.
- [x] WordPress REST publisher with encrypted Application Passwords, health checks, remote links, and durable Blog scheduling.
- [ ] WhatsApp notification adapter; interactive approval remains optional because Meta requires a reachable webhook.
- [ ] Media processing, per-platform validation, calendar, and failure recovery.
- [ ] Normalized engagement metrics and experiment ledger.

**Acceptance:** edits invalidate approval, scheduled posts cannot publish twice, and expired or revoked tokens produce actionable local recovery steps.

## Milestone 3 — compliant lead intelligence

- [x] Google Places API adapter with encrypted credentials, attribution, and transient no-store results.
- [x] CSV/CRM/LinkedIn-export import, durable identity deduplication, source evidence, pipeline status, and suppression lists.
- [x] Robots-aware public website crawler and contact-page extraction with SSRF, redirect, size, type, timeout, and delay controls.
- [x] Deterministic ICP scoring with versioned bulk rescore, explainable reason codes, high-intent filtering, and audited manual correction.
- [ ] Approved provider SDK; no credential theft, CAPTCHA bypass, or core LinkedIn scraper.
- [ ] Outreach draft review, export, consent/legal-basis, and retention tools.

## Milestone 4 — local SEO lab

- [ ] Lightweight HTTP crawler with Playwright fallback for rendered pages.
- [ ] Technical/on-page audits and restart-safe scheduled snapshots.
- [ ] Search Console and PageSpeed/Lighthouse adapters.
- [ ] Keyword map, content briefs, internal links, and cited recommendations.
- [ ] WordPress/Git fix proposals with diff, approval, and rollback.

## Milestone 5 — open-source ecosystem

- [ ] Signed local plugin packages and compatibility metadata.
- [ ] Workflow recipe gallery and portable workspace bundles.
- [ ] Backup/restore, diagnostics, upgrade migrations, and security hardening.
- [ ] Cross-platform installers and background-service integration.
- [ ] Contributor documentation, connector test harness, and release automation.
