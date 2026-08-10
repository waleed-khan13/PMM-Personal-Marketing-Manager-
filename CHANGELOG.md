# Changelog

All notable user-facing changes are documented here.

## 1.0.0 - 2026-08-10

### Added

- Stable social-first release profile for local AI drafting, approval, publishing, scheduling, media, and audit workflows.
- Official publishing support for Telegram, WordPress, Facebook Pages, Instagram Professional single images, LinkedIn Members, and authorized LinkedIn Company Pages.
- Telegram and Slack approval decisions plus WhatsApp approved-template review notifications.
- Durable SQLite queues for scheduled publishing and AI image generation, including restart recovery, progress, cancellation, and retry.
- Opt-in Labs flag for the retained Lead intelligence and Local SEO preview workspaces.

### Changed

- Default navigation now exposes only the v1 social publishing product surface.
- Runtime identity and documentation now describe the `social-v1` edition and its explicit limitations.

### Security and privacy

- Local services bind to loopback by default, application data stays in the operator-controlled data directory, and saved connector secrets remain encrypted at rest.
