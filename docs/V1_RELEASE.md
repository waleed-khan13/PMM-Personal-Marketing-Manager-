# LocalGrowth OS v1.0 release contract

Version 1.0 is the stable, localhost-only social publishing edition. Its promise is deliberately narrow: an operator can connect an AI provider, generate a channel-aware draft, review an exact revision, approve it, and publish immediately or through the durable local scheduler without a LocalGrowth cloud account.

## Stable v1 capabilities

- Next.js console and FastAPI API bound to loopback, with SQLite WAL persistence and encrypted connector secrets.
- Ollama and generic OpenAI-compatible text generation.
- OpenAI-compatible Images API, Automatic1111/Forge, and ComfyUI image generation into a reviewed local media library.
- Dashboard approvals plus Telegram long polling and Slack Socket Mode approval decisions.
- Immediate and scheduled publishing for Telegram, WordPress, Facebook Pages, Instagram Professional single images, LinkedIn Members, and access-approved LinkedIn Company Pages.
- Revision invalidation, idempotent publishing, retries, restart recovery, and a local audit trail.
- WhatsApp Cloud approved-template review notifications. Approval still happens in the dashboard, Telegram, or Slack.
- Native Node/uv launch and loopback-only Docker Compose packaging.

## Explicit v1 limitations

- X can be used as a draft channel but has no publishing adapter yet.
- Instagram carousel and Reels publishing are not included.
- Instagram publishing needs a public HTTPS image URL because Meta fetches the asset; localhost media URLs cannot be fetched by Meta.
- WhatsApp interactive approvals are not included because Meta requires a reachable public HTTPS webhook.
- LinkedIn Company publishing depends on LinkedIn product approval, scopes, and Page permissions that LocalGrowth cannot grant.
- The computer and application must remain running for local listeners and scheduled work.
- Cross-platform installers, automatic backup/restore, normalized engagement analytics, and signed plugins remain roadmap work.

## Labs boundary

Lead intelligence and Local SEO are retained as opt-in previews, hidden by default. They do not share the v1 stability guarantee. To test them, set the environment variable below before starting the app:

```bash
LOCALGROWTH_ENABLE_LABS=1
```

Labs never enable an HTML scraper for LinkedIn or Google Maps. Discovery uses permitted imports, the official Google Places API, and robots-aware public website crawling.

## Release acceptance

A v1 release candidate is acceptable only when all of the following pass from a clean install:

1. `pnpm install` and `pnpm backend:sync` complete with the documented runtimes.
2. `pnpm check` passes type checking, linting, backend tests, browser workflows, accessibility checks, and the production build.
3. The default navigation does not expose Labs modules.
4. The API reports edition `social-v1`, Labs disabled, version `1.0.0`, loopback mode, and SQLite persistence.
5. The real localhost browser workflow proves generation, edit invalidation, approval, immediate publishing, scheduling, media handling, and durable image generation against deterministic provider stand-ins.
6. Native and Docker launchers expose only the console on loopback and retain the data directory across restart.

## Release sequence

1. Run the complete acceptance suite and inspect generated browser artifacts.
2. Create the source release from a clean tagged commit.
3. Publish checksums and concise installation notes with the release.
4. Track Labs graduation and remaining packaging work in [ROADMAP.md](ROADMAP.md) rather than expanding the v1 contract after tagging.
