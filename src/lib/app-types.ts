export type ProviderKind = "ollama" | "openai-compatible";
export type ContentChannel = "linkedin" | "instagram" | "facebook" | "x" | "telegram" | "blog";
export type PostStatus = "pending" | "approved" | "rejected" | "publishing" | "published" | "failed";
export type LocalJobStatus = "queued" | "retrying" | "running" | "completed" | "failed" | "cancelled" | "missed";

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
  entityType: "settings" | "provider" | "post" | "publisher" | "scheduler";
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

export interface PublicAppState {
  workspace: WorkspaceSettings;
  provider: PublicProviderSettings;
  telegram: PublicTelegramSettings;
  posts: GeneratedPost[];
  jobs: LocalJob[];
  scheduler: PublicSchedulerState;
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
