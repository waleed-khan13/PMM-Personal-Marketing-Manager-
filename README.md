# LocalGrowth OS

LocalGrowth OS is an open-source, self-hosted control plane for AI-assisted marketing. Version `0.2.0` is a working local-first release: connect an AI model, generate a real draft, review the exact version, and publish approved Telegram content from one private dashboard.

## What works today

- Connect and test Ollama or an OpenAI-compatible API.
- Save a business profile and generate channel-aware content with the selected model.
- Persist drafts, settings, and audit events to a local JSON store.
- Encrypt saved API keys and Telegram bot tokens with an automatically generated local master key.
- Edit, approve, or reject drafts. Editing an approved draft invalidates its approval.
- Send approval requests to Telegram and process Approve/Reject button callbacks through the webhook.
- Publish an approved Telegram draft and record its remote message ID.

Publishing adapters for LinkedIn, Instagram, Facebook, X, and blogs; schedules and background workers; Slack and WhatsApp approvals; lead discovery; and SEO audits are roadmap work. Those channel names may be used to generate drafts, but v0.2 only publishes to Telegram. LocalGrowth OS does not pretend an unavailable integration succeeded.

## Run locally

Requirements: Node.js 20.9+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), then complete the setup checklist in the dashboard:

1. Add your business profile.
2. Connect Ollama or an OpenAI-compatible provider and test it.
3. Optionally connect a Telegram bot and chat.
4. Generate a draft, review it, approve it, and publish it.

For a production-mode native run:

```bash
pnpm build
pnpm start
```

Native start binds to `127.0.0.1` unless `LOCALGROWTH_HOST` is explicitly changed. The default data directory is `./data`; set `LOCALGROWTH_DATA_DIR` to use another location. Back up the entire directory together because `localgrowth.json` needs its matching `master.key` to decrypt connector secrets.

## Run with Docker

```bash
docker compose up --build
```

Compose exposes the dashboard only on `127.0.0.1:3000` and stores application data in the `localgrowth-data` named volume. When connecting Ollama running on the host, use `http://host.docker.internal:11434` in the provider settings instead of `127.0.0.1`.

## Telegram approval buttons

Sending an approval request works from a local installation because it is an outbound API call. Telegram button callbacks require Telegram to reach a public HTTPS endpoint, so expose the app through a trusted tunnel or reverse proxy and register:

```text
https://your-domain.example/api/telegram/webhook
```

Paste that public URL into the Telegram connection card and click **Connect approval buttons**. LocalGrowth registers a signed webhook and stores its generated secret encrypted. You may set `TELEGRAM_WEBHOOK_SECRET` to provide your own secret instead. Without a public webhook, approval and rejection still work from the local dashboard.

Example environment values are documented in `.env.example`. Connector credentials themselves are entered in the dashboard and stored encrypted; they are not expected in environment variables.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Repository map

- `src/app` - Next.js dashboard and local API routes.
- `src/components` - custom product UI built on shadcn primitives.
- `src/server` - durable store, provider adapters, and Telegram integration.
- `src/lib` - shared domain types and utilities.
- `docs/PRODUCT.md` - product boundaries, features, and core concepts.
- `docs/ARCHITECTURE.md` - target runtime and adapter contracts.
- `docs/ROADMAP.md` - future milestones and acceptance criteria.
- `docs/COMPLIANCE.md` - guardrails for discovery, publishing, outreach, and retention.
- `design-system/localgrowth-os/MASTER.md` - persisted visual system.
- `Dockerfile` and `compose.yaml` - loopback-only self-hosted packaging.

## Safety boundary

LocalGrowth OS will not ship credential theft, CAPTCHA bypasses, rate-limit evasion, or unapproved LinkedIn scraping. LinkedIn discovery must use an approved API/provider, user-owned export, CRM sync, or manual import. Google business discovery should use the Places API or another licensed source and honor its display, attribution, and storage rules. Website crawling must respect robots directives and configurable rate limits.

## License

MIT. Before a public launch, maintainers may choose AGPL-3.0 if keeping hosted modifications open is more important than permissive adoption.
