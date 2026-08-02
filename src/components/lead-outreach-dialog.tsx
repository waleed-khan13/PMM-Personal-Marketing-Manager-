"use client";

import {
  Check,
  CircleAlert,
  Download,
  FileCheck2,
  FileJson,
  Loader2,
  MailCheck,
  PencilLine,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api";
import type {
  ConsentStatus,
  Lead,
  LegalBasis,
  LocalFileExport,
  OutreachDraft,
  PublicAppState,
} from "@/lib/app-types";
import { cn } from "@/lib/utils";

const consentLabels: Record<ConsentStatus, string> = {
  unknown: "Not reviewed",
  granted: "Granted",
  not_applicable: "Not applicable",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

const legalBasisLabels: Record<LegalBasis, string> = {
  consent: "Consent",
  legitimate_interest: "Legitimate interest",
  existing_customer: "Existing customer",
  contract: "Contract",
  other: "Other documented basis",
};

const draftStyles: Record<OutreachDraft["status"], string> = {
  draft: "border-zinc-700 bg-zinc-900 text-zinc-300",
  approved: "border-emerald-500/25 bg-emerald-500/8 text-emerald-300",
  rejected: "border-red-500/25 bg-red-500/8 text-red-300",
  exported: "border-sky-500/25 bg-sky-500/8 text-sky-300",
};

function downloadLocalFile(file: LocalFileExport) {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function displayDate(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function LeadOutreachDialog({
  lead,
  open,
  providerConfigured,
  onOpenChange,
  onChanged,
}: {
  lead: Lead | null;
  open: boolean;
  providerConfigured: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (lead: Lead | null, state: PublicAppState) => void | Promise<void>;
}) {
  const [currentLead, setCurrentLead] = useState<Lead | null>(lead);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(Boolean(open && lead));
  const [busy, setBusy] = useState<string | null>(null);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(lead?.consentStatus ?? "unknown");
  const [legalBasis, setLegalBasis] = useState<LegalBasis | "">(lead?.legalBasis ?? "");
  const [legalBasisNote, setLegalBasisNote] = useState(lead?.legalBasisNote ?? "");
  const [retentionUntil, setRetentionUntil] = useState(lead?.retentionUntil ?? "");
  const [objective, setObjective] = useState("Offer one relevant, low-pressure next step");
  const [tone, setTone] = useState("Clear, relevant, and respectful");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const latestDraft = drafts[0] ?? null;
  const draftChanged = Boolean(
    latestDraft && (subject !== latestDraft.subject || body !== latestDraft.body),
  );

  useEffect(() => {
    if (!open || !lead) return;
    let active = true;
    requestJson<{ items: OutreachDraft[] }>(`/api/leads/${lead.id}/outreach-drafts`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!active) return;
        setDrafts(response.items);
        setSubject(response.items[0]?.subject ?? "");
        setBody(response.items[0]?.body ?? "");
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load outreach drafts.");
      })
      .finally(() => {
        if (active) setLoadingDrafts(false);
      });
    return () => {
      active = false;
    };
  }, [lead, open]);

  const eligibilityChecks = useMemo(() => {
    if (!currentLead) return [];
    return [
      { label: "Not suppressed", ok: !currentLead.suppressed },
      { label: "Email available", ok: Boolean(currentLead.email) },
      { label: "Legal basis recorded", ok: Boolean(currentLead.legalBasis) },
      { label: "Purpose and evidence noted", ok: Boolean(currentLead.legalBasisNote.trim()) },
      { label: "Retention review is current", ok: Boolean(currentLead.retentionUntil) && !currentLead.retentionExpired },
      { label: "Consent state matches the basis", ok: currentLead.outreachBlockers.every((item) => !item.toLowerCase().includes("consent")) },
    ];
  }, [currentLead]);

  async function saveCompliance(event: FormEvent) {
    event.preventDefault();
    if (!currentLead || !legalBasis) return;
    setBusy("compliance");
    try {
      const response = await requestJson<{ ok: boolean; lead: Lead; state: PublicAppState }>(
        `/api/leads/${currentLead.id}/compliance`,
        {
          method: "PUT",
          body: JSON.stringify({ consentStatus, legalBasis, legalBasisNote, retentionUntil }),
        },
      );
      setCurrentLead(response.lead);
      await onChanged(response.lead, response.state);
      toast.success(response.lead.outreachReady ? "Lead is outreach-ready" : "Compliance review saved", {
        description: response.lead.outreachReady ? "AI can now create a review-only email draft." : response.lead.outreachBlockers[0],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the compliance review.");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft(event: FormEvent) {
    event.preventDefault();
    if (!currentLead) return;
    setBusy("generate");
    try {
      const response = await requestJson<{ ok: boolean; draft: OutreachDraft; state: PublicAppState }>(
        `/api/leads/${currentLead.id}/outreach-drafts`,
        { method: "POST", body: JSON.stringify({ objective, tone }) },
      );
      setDrafts((items) => [response.draft, ...items]);
      setSubject(response.draft.subject);
      setBody(response.draft.body);
      await onChanged(currentLead, response.state);
      toast.success("Review-only outreach draft created", { description: "Nothing was sent." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the outreach draft.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!latestDraft) return;
    setBusy("draft");
    try {
      const response = await requestJson<{ ok: boolean; draft: OutreachDraft; state: PublicAppState }>(
        `/api/outreach-drafts/${latestDraft.id}`,
        { method: "PUT", body: JSON.stringify({ subject, body }) },
      );
      setDrafts((items) => items.map((item) => (item.id === response.draft.id ? response.draft : item)));
      setSubject(response.draft.subject);
      setBody(response.draft.body);
      if (currentLead) await onChanged(currentLead, response.state);
      toast.success(`Revision ${response.draft.revision} saved`, { description: "A fresh approval is required." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft.");
    } finally {
      setBusy(null);
    }
  }

  async function decideDraft(decision: "approve" | "reject") {
    if (!latestDraft) return;
    setBusy(decision);
    try {
      const response = await requestJson<{ ok: boolean; draft: OutreachDraft; state: PublicAppState }>(
        `/api/outreach-drafts/${latestDraft.id}/decision`,
        { method: "POST", body: JSON.stringify({ decision, revision: latestDraft.revision }) },
      );
      setDrafts((items) => items.map((item) => (item.id === response.draft.id ? response.draft : item)));
      if (currentLead) await onChanged(currentLead, response.state);
      toast.success(decision === "approve" ? "Current revision approved" : "Draft rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the review decision.");
    } finally {
      setBusy(null);
    }
  }

  async function exportDraft() {
    if (!latestDraft) return;
    setBusy("draft-export");
    try {
      const response = await requestJson<LocalFileExport & { ok: boolean; draft: OutreachDraft }>(
        `/api/outreach-drafts/${latestDraft.id}/export`,
        { method: "POST", body: JSON.stringify({ revision: latestDraft.revision }) },
      );
      downloadLocalFile(response);
      setDrafts((items) => items.map((item) => (item.id === response.draft.id ? response.draft : item)));
      toast.success("Approved CSV downloaded", { description: "The tool did not send the email." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the approved draft.");
    } finally {
      setBusy(null);
    }
  }

  async function exportLead() {
    if (!currentLead) return;
    setBusy("lead-export");
    try {
      const response = await requestJson<LocalFileExport & { ok: boolean }>(
        `/api/leads/${currentLead.id}/data-export`,
        { method: "POST" },
      );
      downloadLocalFile(response);
      toast.success("Lead data package downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the lead data.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteLead(event: FormEvent) {
    event.preventDefault();
    if (!currentLead) return;
    setBusy("delete");
    try {
      const response = await requestJson<{ ok: boolean; deletedId: string; state: PublicAppState }>(
        `/api/leads/${currentLead.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason: deleteReason, confirmation: deleteConfirmation }),
        },
      );
      await onChanged(null, response.state);
      onOpenChange(false);
      toast.success("Lead data permanently deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the lead data.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="min-w-0 max-h-[92vh] overflow-hidden p-0 sm:max-w-4xl">
        {currentLead ? (
          <Tabs className="min-w-0 min-h-0 gap-0" defaultValue="eligibility">
            <DialogHeader className="min-w-0 border-b border-zinc-800 px-5 pt-5 pb-4 pr-14">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <DialogTitle className="flex items-center gap-2"><MailCheck className="size-4" />Reviewed outreach</DialogTitle>
                  <DialogDescription className="mt-2">{currentLead.businessName || currentLead.email || "Lead"} · drafts stay local until you approve and export them.</DialogDescription>
                </div>
                <Badge className={currentLead.outreachReady ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-300" : "border-amber-500/25 bg-amber-500/8 text-amber-300"} variant="outline">
                  {currentLead.outreachReady ? <ShieldCheck className="size-3" /> : <CircleAlert className="size-3" />}
                  {currentLead.outreachReady ? "Outreach-ready" : `${currentLead.outreachBlockers.length} blocker${currentLead.outreachBlockers.length === 1 ? "" : "s"}`}
                </Badge>
              </div>
              <TabsList className="mt-4 h-auto w-full min-w-0 max-w-full justify-start overflow-x-auto rounded-md border border-zinc-800 bg-black p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" variant="default">
                <TabsTrigger className="min-h-8 px-3 text-xs" value="eligibility"><ShieldCheck />Eligibility</TabsTrigger>
                <TabsTrigger className="min-h-8 px-3 text-xs" value="draft"><PencilLine /><span className="sm:hidden">Draft</span><span className="hidden sm:inline">Draft & review</span></TabsTrigger>
                <TabsTrigger className="min-h-8 px-3 text-xs" value="data"><FileJson /><span className="sm:hidden">Data</span><span className="hidden sm:inline">Data controls</span></TabsTrigger>
              </TabsList>
            </DialogHeader>

            <div className="min-w-0 max-h-[calc(92vh-174px)] overflow-x-hidden overflow-y-auto p-5">
              <TabsContent className="min-w-0" value="eligibility">
                <form className="space-y-5" onSubmit={saveCompliance}>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="outreach-legal-basis">Legal basis</Label>
                        <Select onValueChange={(value) => value && setLegalBasis(value as LegalBasis)} value={legalBasis || null}>
                          <SelectTrigger className="h-10 w-full rounded-md border-input bg-[#080808]" id="outreach-legal-basis"><SelectValue placeholder="Select a basis">{legalBasis ? legalBasisLabels[legalBasis] : null}</SelectValue></SelectTrigger>
                          <SelectContent className="border border-zinc-700 bg-[#0c0c0c]">{Object.entries(legalBasisLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="outreach-consent-status">Consent state</Label>
                        <Select onValueChange={(value) => value && setConsentStatus(value as ConsentStatus)} value={consentStatus}>
                          <SelectTrigger className="h-10 w-full rounded-md border-input bg-[#080808]" id="outreach-consent-status"><SelectValue>{consentLabels[consentStatus]}</SelectValue></SelectTrigger>
                          <SelectContent className="border border-zinc-700 bg-[#0c0c0c]">{Object.entries(consentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="outreach-purpose-note">Purpose and supporting evidence</Label>
                        <Textarea id="outreach-purpose-note" maxLength={2000} minLength={5} onChange={(event) => setLegalBasisNote(event.target.value)} placeholder="Why is this outreach appropriate, and what evidence supports the selected basis?" required value={legalBasisNote} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="outreach-retention-until">Retention review date</Label>
                        <Input id="outreach-retention-until" onChange={(event) => setRetentionUntil(event.target.value)} required type="date" value={retentionUntil} />
                        <p className="text-[10px] leading-4 text-zinc-600">Expired records are flagged for review, never silently deleted.</p>
                      </div>
                    </div>

                    <div className="rounded-md border border-zinc-800 bg-black p-4">
                      <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Readiness checklist</p>
                      <div className="mt-3 space-y-2.5">
                        {eligibilityChecks.map((check) => (
                          <div className="flex items-center gap-2 text-xs" key={check.label}>
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", check.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-900 text-zinc-500")}>{check.ok ? <Check className="size-3" /> : <X className="size-3" />}</span>
                            <span className={check.ok ? "text-zinc-300" : "text-zinc-500"}>{check.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="mx-0 mb-0 rounded-md border border-zinc-800 bg-black">
                    <Button disabled={!legalBasis || legalBasisNote.trim().length < 5 || !retentionUntil || busy === "compliance"} type="submit">{busy === "compliance" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Save compliance review</Button>
                  </DialogFooter>
                </form>
              </TabsContent>

              <TabsContent className="min-w-0" value="draft">
                <div className="space-y-5">
                  <form className="grid gap-4 rounded-md border border-zinc-800 bg-black p-4 sm:grid-cols-[1fr_240px_auto] sm:items-end" onSubmit={generateDraft}>
                    <div className="space-y-2"><Label htmlFor="outreach-objective">Draft objective</Label><Input id="outreach-objective" maxLength={500} minLength={3} onChange={(event) => setObjective(event.target.value)} required value={objective} /></div>
                    <div className="space-y-2"><Label htmlFor="outreach-tone">Tone</Label><Input id="outreach-tone" maxLength={160} minLength={2} onChange={(event) => setTone(event.target.value)} required value={tone} /></div>
                    <Button disabled={!currentLead.outreachReady || !providerConfigured || busy === "generate"} type="submit">{busy === "generate" ? <Loader2 className="animate-spin" /> : <MailCheck />}Generate draft</Button>
                    {!providerConfigured ? <p className="text-[10px] text-amber-300 sm:col-span-3">Connect an AI provider and select a model first.</p> : !currentLead.outreachReady ? <p className="text-[10px] text-amber-300 sm:col-span-3">Complete the eligibility checklist before generating outreach.</p> : <p className="text-[10px] text-zinc-600 sm:col-span-3">AI creates editable copy only. This screen has no send action.</p>}
                  </form>

                  {loadingDrafts ? <div className="grid min-h-56 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-600" /></div> : latestDraft ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="text-sm font-medium text-zinc-200">Latest email draft</p><p className="mt-1 text-[11px] text-zinc-600">Revision {latestDraft.revision} · {latestDraft.model}</p></div>
                        <Badge className={cn("capitalize", draftStyles[latestDraft.status])} variant="outline">{latestDraft.status}</Badge>
                      </div>
                      <div className="space-y-2"><Label htmlFor="outreach-subject">Subject</Label><Input id="outreach-subject" maxLength={200} onChange={(event) => setSubject(event.target.value)} value={subject} /></div>
                      <div className="space-y-2"><Label htmlFor="outreach-body">Plain-text email</Label><Textarea className="min-h-52 font-mono text-xs leading-5" id="outreach-body" maxLength={12000} onChange={(event) => setBody(event.target.value)} value={body} /></div>
                      {latestDraft.rationale ? <p className="rounded-md border border-zinc-900 bg-black p-3 text-[11px] leading-5 text-zinc-500"><span className="font-medium text-zinc-300">AI rationale:</span> {latestDraft.rationale}</p> : null}
                      <div className="flex flex-col gap-3 border-t border-zinc-900 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <Button disabled={!draftChanged || !subject.trim() || !body.trim() || busy === "draft"} onClick={() => void saveDraft()} variant="outline">{busy === "draft" ? <Loader2 className="animate-spin" /> : <PencilLine />}Save as new revision</Button>
                        <div className="flex flex-wrap gap-2">
                          <Button disabled={draftChanged || busy === "reject"} onClick={() => void decideDraft("reject")} variant="ghost">{busy === "reject" ? <Loader2 className="animate-spin" /> : <X />}Reject</Button>
                          <Button disabled={draftChanged || busy === "approve" || latestDraft.status === "approved" || latestDraft.status === "exported"} onClick={() => void decideDraft("approve")} variant="outline">{busy === "approve" ? <Loader2 className="animate-spin" /> : <FileCheck2 />}Approve revision {latestDraft.revision}</Button>
                          <Button disabled={draftChanged || !["approved", "exported"].includes(latestDraft.status) || busy === "draft-export"} onClick={() => void exportDraft()}>{busy === "draft-export" ? <Loader2 className="animate-spin" /> : <Download />}Export approved CSV</Button>
                        </div>
                      </div>
                    </div>
                  ) : <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-zinc-800 bg-black px-6 text-center"><div><MailCheck className="mx-auto size-5 text-zinc-600" /><p className="mt-3 text-sm font-medium text-zinc-300">No outreach draft yet</p><p className="mt-1 text-xs text-zinc-600">Generate one after the lead becomes outreach-ready.</p></div></div>}
                </div>
              </TabsContent>

              <TabsContent className="min-w-0" value="data">
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-md border border-zinc-800 bg-black p-4"><FileJson className="size-4 text-zinc-400" /><p className="mt-3 text-sm font-medium text-zinc-200">Portable lead package</p><p className="mt-1 text-xs leading-5 text-zinc-600">Download the lead, evidence, compliance fields, and outreach drafts as readable JSON.</p><Button className="mt-4" disabled={busy === "lead-export"} onClick={() => void exportLead()} variant="outline">{busy === "lead-export" ? <Loader2 className="animate-spin" /> : <Download />}Export lead data</Button></div>
                    <div className="rounded-md border border-zinc-800 bg-black p-4"><ShieldCheck className="size-4 text-zinc-400" /><p className="mt-3 text-sm font-medium text-zinc-200">Retention status</p><p className="mt-1 text-xs leading-5 text-zinc-600">Review date: <span className={currentLead.retentionExpired ? "text-red-300" : "text-zinc-300"}>{displayDate(currentLead.retentionUntil)}</span></p><p className="mt-2 text-[11px] leading-4 text-zinc-600">Use Eligibility to extend a justified retention period. Expiry never triggers automatic deletion.</p></div>
                  </div>

                  <form className="rounded-md border border-red-500/25 bg-red-500/5 p-4" onSubmit={deleteLead}>
                    <div className="flex items-start gap-3"><Trash2 className="mt-0.5 size-4 shrink-0 text-red-300" /><div><p className="text-sm font-medium text-red-200">Permanently delete local lead data</p><p className="mt-1 text-xs leading-5 text-zinc-500">This removes the lead, deduplication identities, and every outreach draft. The non-personal audit record remains.</p></div></div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label htmlFor="lead-delete-reason">Deletion reason</Label><Input id="lead-delete-reason" maxLength={500} minLength={5} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Example: retention period ended" required value={deleteReason} /></div>
                      <div className="space-y-2"><Label htmlFor="lead-delete-confirmation">Type DELETE to confirm</Label><Input autoComplete="off" id="lead-delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} required value={deleteConfirmation} /></div>
                    </div>
                    <Button className="mt-4" disabled={deleteReason.trim().length < 5 || deleteConfirmation !== "DELETE" || busy === "delete"} type="submit" variant="destructive">{busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete lead permanently</Button>
                  </form>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
