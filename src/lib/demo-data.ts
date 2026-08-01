import type { ActivityEvent, AgentSummary, ApprovalItem } from "@/lib/types";

export const initialApprovals: ApprovalItem[] = [
  {
    id: "post_1042",
    channel: "LinkedIn",
    format: "Text + image",
    title: "The hidden cost of manual follow-ups",
    excerpt:
      "Most small teams do not have a lead problem. They have a follow-up consistency problem. Here are three workflows that protect every warm conversation...",
    scheduledFor: "Today, 6:30 PM",
    createdBy: "Copywriter",
    policyScore: 96,
    status: "pending",
  },
  {
    id: "post_1043",
    channel: "Instagram",
    format: "7-slide carousel",
    title: "A one-hour local SEO reset",
    excerpt:
      "A practical carousel for service businesses: fix location signals, remove duplicate metadata, and give every service page one clear job.",
    scheduledFor: "Tomorrow, 11:00 AM",
    createdBy: "Creative Director",
    policyScore: 91,
    status: "pending",
  },
];

export const agents: AgentSummary[] = [
  {
    id: "strategist",
    initials: "GS",
    name: "Growth Strategist",
    role: "Campaign planning",
    status: "working",
    currentTask: "Reviewing Q3 content signals",
    color: "green",
  },
  {
    id: "copywriter",
    initials: "CW",
    name: "Copywriter",
    role: "Channel copy",
    status: "review",
    currentTask: "2 drafts awaiting approval",
    color: "blue",
  },
  {
    id: "lead-scout",
    initials: "LS",
    name: "Lead Scout",
    role: "Permission-safe research",
    status: "working",
    currentTask: "Enriching 18 business domains",
    color: "violet",
  },
  {
    id: "seo-analyst",
    initials: "SA",
    name: "SEO Analyst",
    role: "Website health",
    status: "waiting",
    currentTask: "Next audit at 2:00 AM",
    color: "amber",
  },
];

export const activity: ActivityEvent[] = [
  {
    id: "event_1",
    actor: "Policy Reviewer",
    action: "cleared a LinkedIn draft",
    detail: "No unsupported claims · score 96/100",
    time: "4 min ago",
    tone: "success",
  },
  {
    id: "event_2",
    actor: "Lead Scout",
    action: "completed a discovery run",
    detail: "18 qualified · 4 duplicates removed",
    time: "18 min ago",
    tone: "info",
  },
  {
    id: "event_3",
    actor: "SEO Analyst",
    action: "found a new issue",
    detail: "3 service pages share the same title",
    time: "42 min ago",
    tone: "warning",
  },
];

export const contentRows = [
  {
    title: "The hidden cost of manual follow-ups",
    channel: "LinkedIn",
    state: "Needs approval",
    owner: "Copywriter",
    date: "Today · 6:30 PM",
  },
  {
    title: "A one-hour local SEO reset",
    channel: "Instagram",
    state: "Needs approval",
    owner: "Creative Director",
    date: "Tomorrow · 11:00 AM",
  },
  {
    title: "August automation checklist",
    channel: "WordPress",
    state: "Generating",
    owner: "Researcher",
    date: "Fri · 9:00 AM",
  },
  {
    title: "Why response time beats more ad spend",
    channel: "Facebook",
    state: "Scheduled",
    owner: "Publisher",
    date: "Sat · 3:00 PM",
  },
];

export const leadRows = [
  {
    company: "Northstar Dental",
    source: "Google Places",
    score: 92,
    signal: "No booking CTA on mobile",
    location: "Lahore",
  },
  {
    company: "Axis Legal Studio",
    source: "Public website",
    score: 87,
    signal: "New service page detected",
    location: "Karachi",
  },
  {
    company: "Craftline Interiors",
    source: "CSV import",
    score: 81,
    signal: "Re-engagement window",
    location: "Islamabad",
  },
  {
    company: "Meridian Wellness",
    source: "Google Places",
    score: 76,
    signal: "Incomplete local citations",
    location: "Rawalpindi",
  },
];

export const seoIssues = [
  {
    severity: "High",
    issue: "Duplicate title tags",
    pages: 3,
    recommendation: "Create intent-specific titles for each service page.",
  },
  {
    severity: "Medium",
    issue: "Missing image alt text",
    pages: 12,
    recommendation: "Describe useful image context without keyword stuffing.",
  },
  {
    severity: "Medium",
    issue: "Orphan service page",
    pages: 1,
    recommendation: "Add contextual links from two relevant category pages.",
  },
  {
    severity: "Low",
    issue: "Sitemap timestamp drift",
    pages: 8,
    recommendation: "Update lastmod only when page content changes.",
  },
];
