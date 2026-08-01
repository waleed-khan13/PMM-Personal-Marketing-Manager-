export type NavigationId =
  | "overview"
  | "content"
  | "approvals"
  | "campaigns"
  | "leads"
  | "seo"
  | "automations"
  | "integrations";

export type ApprovalState = "pending" | "approved" | "changes_requested";

export interface ApprovalItem {
  id: string;
  channel: "LinkedIn" | "Instagram" | "Facebook" | "WordPress";
  format: string;
  title: string;
  excerpt: string;
  scheduledFor: string;
  createdBy: string;
  policyScore: number;
  status: ApprovalState;
}

export interface AgentSummary {
  id: string;
  initials: string;
  name: string;
  role: string;
  status: "working" | "waiting" | "review";
  currentTask: string;
  color: "green" | "blue" | "violet" | "amber";
}

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  detail: string;
  time: string;
  tone: "success" | "info" | "warning";
}
