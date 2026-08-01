# Architecture

## Recommended stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web console | Next.js + TypeScript | One language for UI and API contracts; strong self-hosted React ecosystem. |
| API | Fastify-based service in the future monorepo | Explicit auth, webhooks, OpenAPI, and connector boundaries. |
| Durable work | BullMQ + Redis | Scheduling, retries, concurrency, and dead-letter handling. |
| Data | PostgreSQL + pgvector | Relational integrity, audit queries, and optional local retrieval. |
| Browser audit | Crawlee/Playwright worker | Controlled website crawling and rendered SEO checks. |
| Local AI | Ollama/LM Studio/LocalAI adapters | Private, user-controlled inference. |
| Packaging | Docker Compose plus native Node quickstart | Friendly local install, with a production migration path. |

The current repository starts as a single Next.js product shell. Once the first external connector is implemented, it will become a pnpm workspace with `apps/web`, `apps/api`, `apps/worker`, and shared contract packages. This avoids premature infrastructure while preserving the intended boundaries.

## Runtime modes

### `local_trusted`

- Binds to loopback only.
- Single local operator and no login friction.
- Secrets encrypted at rest with a locally generated master key.
- Remote approval callbacks use a user-configured HTTPS tunnel or relay.

### `authenticated`

- Required when binding beyond loopback.
- User/session authentication, CSRF protection, rate limits, origin checks, and workspace RBAC.
- Reverse proxy/TLS deployment and explicit trusted-proxy configuration.

## Control flow

```text
Trigger (schedule / UI / webhook)
  -> durable workflow run
  -> agent task with scoped context and provider budget
  -> structured draft
  -> deterministic schema + policy checks
  -> approval request
  -> signed human decision
  -> connector action with idempotency key
  -> normalized result and metrics
  -> append-only audit event
```

The connector action never consumes free-form model output directly. Every payload is parsed into a versioned schema, validated, policy-checked, and frozen when submitted for approval. Editing after approval creates a new version and a new decision.

## Adapter families

Each adapter publishes a manifest containing `id`, `version`, capabilities, config schema, secret fields, health check, required scopes, and rate-limit hints.

### AI provider adapter

```ts
interface ModelProviderAdapter {
  listModels(): Promise<ModelDescriptor[]>;
  health(): Promise<HealthResult>;
  generate(request: GenerateRequest, signal: AbortSignal): Promise<GenerateResult>;
  embed?(request: EmbedRequest, signal: AbortSignal): Promise<EmbedResult>;
}
```

### Approval channel adapter

```ts
interface ApprovalAdapter {
  send(request: FrozenApprovalRequest): Promise<ExternalApprovalRef>;
  verifyCallback(request: Request): Promise<ApprovalDecision>;
  update?(ref: ExternalApprovalRef, state: ApprovalState): Promise<void>;
}
```

### Publisher adapter

```ts
interface PublisherAdapter {
  validate(item: FrozenContentVersion): Promise<ValidationResult>;
  publish(item: FrozenContentVersion, key: IdempotencyKey): Promise<PublishResult>;
  metrics?(remoteId: string): Promise<NormalizedMetrics>;
}
```

### Lead source adapter

```ts
interface LeadSourceAdapter {
  search(query: LeadQuery, cursor?: string): Promise<LeadPage>;
  retentionPolicy(): SourceRetentionPolicy;
  evidence(record: SourceRecord): SourceEvidence;
}
```

## Security boundaries

- Connector secrets are envelope-encrypted and readable only by the server/worker scope that needs them.
- Webhook signatures and timestamps are verified before a decision or event is accepted.
- Approval tokens are one-time, short-lived, workspace-bound, and content-version-bound.
- Outbound URLs pass SSRF controls: scheme allow-list, DNS/IP validation, redirect revalidation, size/time limits, and private-network policy.
- Crawled content is labeled untrusted and cannot override system policies or request tools/secrets.
- Publisher operations use idempotency keys and normalized retry rules to prevent duplicate posts.
- Logs redact secrets and sensitive lead fields; audit events retain hashes and references when full payload retention is unnecessary.

## Deployment target

The stable release should support:

```bash
docker compose up -d
```

and expose only `http://127.0.0.1:3000` by default. PostgreSQL, Redis, and storage stay on the internal Compose network. Ollama may run on the host or as an optional profile. Remote deployment requires switching to `authenticated` mode.
