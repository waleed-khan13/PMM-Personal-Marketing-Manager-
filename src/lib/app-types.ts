export type ProviderKind = "ollama" | "openai-compatible";
export type ContentChannel = "linkedin" | "instagram" | "facebook" | "x" | "telegram" | "blog";
export type PostStatus = "pending" | "approved" | "rejected" | "publishing" | "published" | "failed";
export type LocalJobStatus = "queued" | "retrying" | "running" | "completed" | "failed" | "cancelled" | "missed";
export type ConnectorCapability = "approval" | "notification" | "publish" | "leads" | "analytics" | "cms";
export type ConnectorAvailability = "available" | "planned" | "access-gated" | "notification-only" | "built-in";

export interface WorkspaceSettings {
  name: string;
  businessName: string;
  description: string;
  timezone: string;
}

export interface PublicProviderSettings {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  configured: boolean;
  updatedAt: string | null;
}

export interface PublicTelegramSettings {
  chatId: string;
  hasBotToken: boolean;
  configured: boolean;
  pollingEnabled: boolean;
  pollingActive: boolean;
  pollingStatus: string;
  lastError: string | null;
  updatedAt: string | null;
}

export interface GeneratedPost {
  id: string;
  revision: number;
  topic: string;
  channel: ContentChannel;
  tone: string;
  objective: string;
  title: string;
  body: string;
  hashtags: string[];
  rationale: string;
  status: PostStatus;
  providerKind: ProviderKind;
  model: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  remoteId: string | null;
  lastError: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: "settings" | "provider" | "post" | "publisher" | "scheduler" | "connector";
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface LocalJob {
  id: string;
  kind: "post.publish";
  status: LocalJobStatus;
  payload: {
    post_id: string;
    revision: number;
    channel: ContentChannel;
  };
  runAt: string;
  attempts: number;
  maxAttempts: number;
  lockedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSchedulerState {
  paused: boolean;
  active: boolean;
  status: string;
  lastError: string | null;
  catchUpHours: number;
}

export interface ConnectorFieldSpec {
  key: string;
  label: string;
  required: boolean;
  placeholder: string;
  helpText: string;
}

export interface ConnectorManifest {
  adapterId: string;
  name: string;
  description: string;
  availability: ConnectorAvailability;
  capabilities: ConnectorCapability[];
  configFields: ConnectorFieldSpec[];
  secretFields: ConnectorFieldSpec[];
  allowedScopes: string[];
  requiredScopes: string[];
  docsUrl: string | null;
}

export interface ConnectorAccount {
  id: string;
  adapterId: string;
  adapterName: string;
  name: string;
  config: Record<string, string>;
  secretStatus: Record<string, boolean>;
  scopes: string[];
  capabilities: ConnectorCapability[];
  enabled: boolean;
  status: "saved" | "verified" | "error";
  remoteAccountId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicConnectorsState {
  catalog: ConnectorManifest[];
  accounts: ConnectorAccount[];
}

export interface PublicAppState {
  workspace: WorkspaceSettings;
  provider: PublicProviderSettings;
  telegram: PublicTelegramSettings;
  posts: GeneratedPost[];
  jobs: LocalJob[];
  scheduler: PublicSchedulerState;
  connectors: PublicConnectorsState;
  audit: AuditEvent[];
  runtime: {
    version: string;
    mode: string;
    persistent: boolean;
    database: string;
  };
}

export interface ProviderConnectionResult {
  ok: boolean;
  message: string;
  models?: string[];
  latencyMs?: number;
}
