export type ProviderKind = "ollama" | "openai-compatible";
export type ContentChannel = "linkedin" | "instagram" | "facebook" | "x" | "telegram" | "blog";
export type PostStatus = "pending" | "approved" | "rejected" | "publishing" | "published" | "failed";
export type LocalJobStatus = "queued" | "retrying" | "running" | "completed" | "failed" | "cancelled" | "missed";
export type ConnectorCapability = "approval" | "notification" | "publish" | "leads" | "analytics" | "cms";
export type ConnectorAvailability = "available" | "planned" | "access-gated" | "notification-only" | "built-in";
export type LeadSource = "csv" | "linkedin-export" | "crm-export" | "manual" | "website-crawl";
export type LeadStatus = "new" | "qualified" | "contacted" | "archived";

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
  remoteUrl: string | null;
  lastError: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: "settings" | "provider" | "post" | "publisher" | "scheduler" | "connector" | "lead";
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
  config: Record<string, string | boolean>;
  secretStatus: Record<string, boolean>;
  scopes: string[];
  capabilities: ConnectorCapability[];
  enabled: boolean;
  status: "saved" | "verified" | "error";
  remoteAccountId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  listener: {
    active: boolean;
    status: "stopped" | "starting" | "connecting" | "listening" | "retrying";
    lastError: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PublicConnectorsState {
  catalog: ConnectorManifest[];
  accounts: ConnectorAccount[];
}

export interface LeadEvidence {
  source: LeadSource;
  sourceLabel: string;
  sourceRef?: string;
  importedAt: string;
}

export interface IcpScoreReason {
  code: string;
  label: string;
  points: number;
  detail: string;
}

export interface IcpProfile {
  id: number;
  name: string;
  targetKeywords: string[];
  excludedKeywords: string[];
  targetLocations: string[];
  requireWebsite: boolean;
  requireContact: boolean;
  version: number;
  configured: boolean;
  updatedAt: string | null;
}

export interface Lead {
  id: string;
  businessName: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  source: LeadSource;
  sourceLabel: string;
  sourceRef: string | null;
  notes: string;
  evidence: LeadEvidence[];
  status: LeadStatus;
  suppressed: boolean;
  suppressionReason: string | null;
  suppressedAt: string | null;
  icpScore: number | null;
  icpReasons: IcpScoreReason[];
  icpProfileVersion: number | null;
  icpScoredAt: string | null;
  manualScore: number | null;
  manualScoreReason: string | null;
  manualScoreUpdatedAt: string | null;
  effectiveScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSummary {
  total: number;
  active: number;
  suppressed: number;
  new: number;
  qualified: number;
  contacted: number;
  highIntent: number;
}

export interface LeadListResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

export interface LeadImportRow {
  businessName: string;
  website: string;
  email: string;
  phone: string;
  location: string;
  sourceRef: string;
  notes: string;
}

export interface LeadImportResult {
  processed: number;
  created: number;
  merged: number;
  unchanged: number;
  suppressed: number;
}

export interface GooglePlaceAttribution {
  provider: string;
  providerUri: string;
}

export interface GooglePlaceResult {
  placeId: string;
  name: string;
  address: string;
  website: string;
  phone: string;
  googleMapsUri: string;
  attributions: GooglePlaceAttribution[];
}

export interface GooglePlacesSearchResponse {
  ok: boolean;
  results: GooglePlaceResult[];
  storagePolicy: "transient";
  attribution: "Google Maps";
}

export interface WebsiteCrawlResult extends LeadImportRow {
  pages: Array<{ url: string; title: string }>;
  robotsRespected: boolean;
  userAgent: string;
}

export interface PublicAppState {
  workspace: WorkspaceSettings;
  provider: PublicProviderSettings;
  telegram: PublicTelegramSettings;
  posts: GeneratedPost[];
  jobs: LocalJob[];
  scheduler: PublicSchedulerState;
  connectors: PublicConnectorsState;
  leadSummary: LeadSummary;
  icpProfile: IcpProfile;
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
