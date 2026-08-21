# Changelog

All notable user-facing changes are documented here.

## Unreleased

## 1.0.4 - 2026-08-21

### Added

- Added live release-download progress with percentage, downloaded and total size, transfer speed, and estimated time remaining in interactive terminals.
- Added throttled percentage milestones for redirected or non-interactive installer output.

## 1.0.3 - 2026-08-20

### Fixed

- Changed release downloads from a total-duration limit to a progress-based idle timeout, allowing very slow but active connections to finish.

## 1.0.2 - 2026-08-19

### Fixed

- Increased the native release archive download window so slower connections can complete the checksummed localhost installation.

## 1.0.1 - 2026-08-18

### Changed

- Rebranded the complete product and distribution surface as Socium, including the UI, `socium` npm/CLI package, `SOCIUM_*` configuration, native runtime assets, local application-data paths, documentation, and release automation.

## 1.0.0 - 2026-08-10

### Added

- Stable social-first release profile for local AI drafting, approval, publishing, scheduling, media, and audit workflows.
- Official publishing support for Telegram, WordPress, Facebook Pages, Instagram Professional single images, LinkedIn Members, and authorized LinkedIn Company Pages.
- Telegram and Slack approval decisions plus WhatsApp approved-template review notifications.
- Durable SQLite queues for scheduled publishing and AI image generation, including restart recovery, progress, cancellation, and retry.
- Opt-in Labs flag for the retained Lead intelligence and Local SEO preview workspaces.
- `npx socium onboard` installer and lifecycle CLI for checksummed Windows, macOS, and Linux native bundles.
- Standalone FastAPI runtime with embedded migrations and a portable Next.js production runtime; end users need only Node.js 20.9+.
- Tag-driven CI release automation for per-platform builds, native smoke tests, SHA-256 assets, the update manifest, and npm publication.

### Changed

- Default navigation now exposes only the v1 social publishing product surface.
- Runtime identity and documentation now describe the `social-v1` edition and its explicit limitations.
- Docker is now an optional advanced path rather than a prerequisite for the primary localhost installation.

### Security and privacy

- Local services bind to loopback by default, application data stays in the operator-controlled data directory, and saved connector secrets remain encrypted at rest.
- Native installers reject insecure remote manifests and archives with mismatched SHA-256 checksums; production web dependencies pass the high-severity audit gate.
