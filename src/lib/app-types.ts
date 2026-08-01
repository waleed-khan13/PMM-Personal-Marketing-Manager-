export type ProviderKind = "ollama" | "openai-compatible";
export type ContentChannel = "linkedin" | "instagram" | "facebook" | "x" | "telegram" | "blog";
export type PostStatus = "pending" | "approved" | "rejected" | "publishing" | "published" | "failed";

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
  webhookUrl: string;
  webhookConfigured: boolean;
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
  entityType: "settings" | "provider" | "post" | "publisher";
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface PublicAppState {
  workspace: WorkspaceSettings;
  provider: PublicProviderSettings;
  telegram: PublicTelegramSettings;
  posts: GeneratedPost[];
  audit: AuditEvent[];
  runtime: {
    version: string;
    mode: string;
    persistent: boolean;
  };
}

export interface ProviderConnectionResult {
  ok: boolean;
  message: string;
  models?: string[];
  latencyMs?: number;
}
