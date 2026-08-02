# LocalGrowth OS

LocalGrowth OS is an open-source, localhost-only control plane for AI-assisted marketing. Version `0.3.0` runs a Next.js console and FastAPI service on the operator's own computer, stores application data in SQLite, and does not require a hosted LocalGrowth account or server.

## What works today

- Connect and test Ollama or a generic OpenAI-compatible API.
- Save a business profile and generate channel-aware content with the selected model.
- Persist settings, drafts, revisions, and audit events in a local SQLite WAL database.
- Encrypt saved API keys and Telegram bot tokens with an automatically generated local master key.
- Import the previous v0.2 JSON store on first launch without deleting the original file.
- Edit, approve, or reject exact draft revisions; edits invalidate prior approval.
- Send Telegram approval requests and receive button decisions through local long polling.
- Publish an approved Telegram draft exactly once and record its remote message ID.
- Schedule approved Telegram revisions with a restart-safe SQLite job queue, pause/resume, catch-up, cancellation, and reviewed retries.
- Run the browser through one same-origin surface at `127.0.0.1:3000`; the API remains internal.

Publishing adapters for LinkedIn, Instagram, Facebook, X, and blogs; Slack approvals; compliant lead discovery; and SEO audits remain roadmap work. Channel names can already be used to generate drafts, but v0.3 publishes and schedules only to Telegram and never pretends an unavailable integration succeeded.

## Native localhost run

Requirements:

- Node.js 20.9+
- pnpm 10+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

```bash
pnpm install
pnpm backend:sync
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `pnpm dev` starts both the local FastAPI service on loopback port `8000` and the Next.js console on loopback port `3000`.

Complete the checklist in the dashboard:

1. Add the business profile.
2. Connect Ollama or an OpenAI-compatible provider and test it.
3. Optionally connect a Telegram bot and chat.
4. Start the local Telegram approval listener.
5. Generate and review a Telegram draft, then approve it.
6. Publish immediately or schedule the exact approved revision from the local queue.

For a production-mode native run:

```bash
pnpm build
pnpm start
```

The native launcher waits for FastAPI migrations and health checks before starting the web console. The default data directory is `./data`; set `LOCALGROWTH_DATA_DIR` to another local directory if needed.

Back up the complete data directory together. `localgrowth.db` needs its matching `master.key` to decrypt connector secrets. If `localgrowth.json` from v0.2 exists when SQLite is first created, its settings, posts, audit events, and encrypted secrets are imported automatically while the JSON file remains untouched.

## Docker localhost run

```bash
docker compose up --build
```

Compose runs the FastAPI service on a private container network and exposes only `127.0.0.1:3000`. Application data lives in the `localgrowth-data` volume. When connecting Ollama running on the host, use `http://host.docker.internal:11434` in provider settings.

## Telegram approvals without hosting

Telegram notifications and publishing are outbound API calls. Approval buttons use Telegram `getUpdates` long polling from the local worker, so no domain, public HTTPS endpoint, tunnel, webhook, or LocalGrowth cloud service is required.

The application must be running to receive a new Telegram decision. Telegram retains pending bot updates temporarily; LocalGrowth stores the processed update ID in SQLite to reject replays after restart.

## Local-only behavior

- No LocalGrowth account, cloud database, billing system, or telemetry endpoint is required.
- Native services bind to `127.0.0.1` by default.
- The operator's computer must be on for scheduled automation and approval listeners to run.
- Local drafts, dashboard approvals, audit history, and Ollama remain available without internet.
- Provider-backed AI, social publishing, lead sources, and analytics naturally need their provider connection.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm backend:test
pnpm build
```

Run every check together with:

```bash
pnpm check
```

## Repository map

- `src/app` — Next.js dashboard and same-origin FastAPI proxy.
- `src/components` — custom product UI built on shadcn primitives.
- `src/lib` — browser-side domain contracts and utilities.
- `backend/app` — FastAPI routes, local services, Telegram poller, durable scheduler, and domain operations.
- `backend/alembic` — automatic SQLite schema migrations.
- `backend/tests` — local API, encryption, approval, scheduling, and publishing tests.
- `docs/PRODUCT.md` — product boundaries, features, and core concepts.
- `docs/ARCHITECTURE.md` — localhost runtime and adapter contracts.
- `docs/ROADMAP.md` — milestones and acceptance criteria.
- `docs/COMPLIANCE.md` — discovery, publishing, outreach, and retention guardrails.
- `design-system/localgrowth-os/MASTER.md` — persisted visual system.
- `Dockerfile`, `backend/Dockerfile`, and `compose.yaml` — loopback-only container packaging.

## Safety boundary

LocalGrowth OS will not ship credential theft, CAPTCHA bypasses, rate-limit evasion, or unapproved LinkedIn scraping. LinkedIn discovery must use an approved API/provider, user-owned export, CRM sync, or manual import. Google business discovery should use the Places API or another licensed source and honor its attribution and storage rules. Website crawling must respect robots directives and configurable rate limits.

## License

MIT.
