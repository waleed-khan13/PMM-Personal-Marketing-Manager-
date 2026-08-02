# Architecture

## Product boundary

LocalGrowth OS is a single-operator, localhost-only application. The project does not operate a cloud control plane, hosted database, multi-tenant API, or SaaS account system. Internet access is used only when the operator explicitly connects an AI, approval, lead, analytics, or publishing provider.

All application services bind to loopback in a native install. Docker Compose exposes only the web console on `127.0.0.1:3000`; the API remains on the private Compose network.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web console | Next.js + React + TypeScript | Mature local web UI, reusable contracts, and the existing custom shadcn interface. |
| Local API | FastAPI + Pydantic | Strong Python AI/crawling ecosystem, typed validation, and generated OpenAPI. |
| Data | SQLite in WAL mode | Serverless single-file storage with transactions, indexes, backup portability, and low install overhead. |
| ORM/migrations | SQLAlchemy + Alembic | Explicit relational models and automatic local upgrade migrations. |
| Durable work | SQLite-backed job table + local worker | Restart-safe schedules and retries without requiring Redis or another service. |
| Browser audit | Lightweight HTTP crawler + Playwright fallback | Fast static crawling while retaining rendered-page checks when required. |
| Local AI | Ollama/LM Studio/LocalAI adapters | Private user-controlled inference. |
| Cloud AI | Generic OpenAI-compatible adapter | Vendor-neutral access using user-owned credentials. |
| Packaging | Native launcher plus optional Docker Compose | A normal localhost install first, with a reproducible container option. |

## Process layout

```text
Browser → 127.0.0.1:3000 (Next.js)
                    ↓ same-origin /api proxy
          127.0.0.1:8000 (FastAPI)
                    ↓
          data/localgrowth.db (SQLite WAL)
                    ↓
          local scheduler / worker
                    ↓ outbound connections only
          AI, Telegram, Slack, social and data APIs
```

The browser never calls the internal API port directly. This avoids cross-origin configuration and keeps a single public localhost surface. Native startup launches the API before the web console. Compose places both processes on an internal network and publishes only port `3000` to loopback.

## Runtime rules

- Bind the web console and native API to `127.0.0.1`, never `0.0.0.0`, by default.
- Store the SQLite database, master encryption key, exports, and generated media under one configurable local data directory.
- Keep connector secrets encrypted with a local 256-bit master key. Never return decrypted secrets to the browser or logs.
- Persist connector accounts separately from provider settings. Validate every config key, secret key, and requested scope against the adapter manifest before encrypting it.
- Use SQLite WAL, foreign keys, a busy timeout, short write transactions, and one durable writer workflow.
- Persist schedules before acknowledging them. If the computer is off, record and apply an explicit catch-up policy after restart.
- Bind each publish job to an exact content revision and a unique idempotency key. A duplicate scheduling request returns the existing job.
- Do not automatically retry an ambiguous remote publish. Mark it for review so a network timeout cannot silently create duplicate posts.
- Do not add PostgreSQL, Redis, Kubernetes, remote authentication, billing, or multi-tenancy to the core distribution.

## Control flow

```text
Trigger (schedule / UI / local connector listener)
  → durable local job
  → agent task with scoped context and provider budget
  → structured draft
  → deterministic schema and policy checks
  → approval request
  → version-bound human decision
  → connector action with idempotency key
  → normalized result and metrics
  → append-only audit event
```

The connector action never consumes free-form model output directly. Every payload is parsed into a versioned schema, validated, policy-checked, and frozen when submitted for approval. Editing after approval creates a new revision and invalidates the previous decision.

The local scheduler claims one due SQLite job at a time, recovers stale locks on restart, and applies a bounded catch-up window. Preflight failures can retry with backoff. Once a Telegram delivery has been reserved and attempted, an uncertain response becomes a failed review item instead of an automatic retry; the operator must explicitly requeue it.

## Local approval transports

- Dashboard decisions are always available and require no external callback.
- Telegram uses `getUpdates` long polling from the local worker; a public webhook is neither requested nor required.
- Slack account health checks call `auth.test` for the bot token and `apps.connections.open` for the app token. The planned approval listener will use Socket Mode so decisions arrive over an outbound WebSocket.
- Connectors that mandate a public inbound webhook, including interactive WhatsApp Cloud callbacks, are notification-only or optional in strict localhost mode.

## Adapter families

Adapters publish an ID, version, capability list, config schema, secret fields, health check, required scopes, rate-limit hints, and data-retention policy.

The connector registry is the public catalog and validation boundary. Account rows contain non-secret configuration and one encrypted JSON secret envelope. Public state projects only per-field presence flags; decrypted runtime data stays inside connector services and is never serialized into an API response.

### AI provider

```python
class ModelProvider(Protocol):
    def list_models(self) -> list[ModelDescriptor]: ...
    def health(self) -> HealthResult: ...
    def generate(self, request: GenerateRequest) -> GenerateResult: ...
```

### Approval channel

```python
class ApprovalChannel(Protocol):
    def send(self, request: FrozenApprovalRequest) -> ExternalApprovalRef: ...
    def poll(self) -> list[ApprovalDecision]: ...
```

### Publisher

```python
class Publisher(Protocol):
    def validate(self, item: FrozenContentVersion) -> None: ...
    def publish(self, item: FrozenContentVersion, idempotency_key: str) -> PublishResult: ...
```

### Lead source

```python
class LeadSource(Protocol):
    def search(self, query: LeadQuery, cursor: str | None = None) -> LeadPage: ...
    def retention_policy(self) -> SourceRetentionPolicy: ...
```

## Security boundaries

- Only loopback traffic reaches native HTTP services.
- Connector credentials are encrypted at rest and decrypted only inside the local API/worker operation that needs them.
- Approval decisions are content-revision-bound and replay-protected by the provider update ID.
- Outbound provider URLs reject embedded credentials and unexpected schemes; crawlers add DNS/IP, redirect, size, and timeout controls.
- Crawled content is untrusted data and cannot override system policies or request tools/secrets.
- Publisher operations reserve an exact revision before the remote call and verify the reservation before finalizing it.
- Logs redact secrets and sensitive lead fields.

## Installation target

The stable release must support both:

```bash
pnpm install
pnpm dev
```

and:

```bash
docker compose up --build
```

Both modes open only `http://127.0.0.1:3000`. The application continues working offline for local data, drafts, approvals in the dashboard, and Ollama; provider-backed features naturally require their provider connection.
