"use client";

import { CheckCircle2, Loader2, RefreshCw, SlidersHorizontal, Target } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api";
import type { IcpProfile, PublicAppState } from "@/lib/app-types";

function criteriaText(values: string[]) {
  return values.join(", ");
}

function parseCriteria(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

export function IcpScoringPanel({
  profile,
  onStateChange,
  onRescored,
}: {
  profile: IcpProfile;
  onStateChange: (state: PublicAppState) => void;
  onRescored: () => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [targetKeywords, setTargetKeywords] = useState(criteriaText(profile.targetKeywords));
  const [excludedKeywords, setExcludedKeywords] = useState(criteriaText(profile.excludedKeywords));
  const [targetLocations, setTargetLocations] = useState(criteriaText(profile.targetLocations));
  const [requireWebsite, setRequireWebsite] = useState(profile.requireWebsite);
  const [requireContact, setRequireContact] = useState(profile.requireContact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const keywords = parseCriteria(targetKeywords);
    const locations = parseCriteria(targetLocations);
    if (keywords.length === 0 && locations.length === 0) {
      setError("Add at least one target keyword or target location.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await requestJson<{
        ok: boolean;
        profile: IcpProfile;
        rescored: number;
        state: PublicAppState;
      }>("/api/leads/icp-profile", {
        method: "PUT",
        body: JSON.stringify({
          name,
          targetKeywords: keywords,
          excludedKeywords: parseCriteria(excludedKeywords),
          targetLocations: locations,
          requireWebsite,
          requireContact,
        }),
      });
      onStateChange(response.state);
      await onRescored();
      toast.success("ICP profile saved", {
        description: `${response.rescored} local lead${response.rescored === 1 ? "" : "s"} rescored with version ${response.profile.version}.`,
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save the ICP profile.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden border-zinc-800 bg-[#050505]">
      <CardHeader className="border-b border-zinc-900 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_36%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md border border-zinc-700 bg-black text-zinc-100">
              <Target className="size-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Ideal customer profile</CardTitle>
                <Badge className={profile.configured ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"} variant="outline">
                  {profile.configured ? `Active · v${profile.version}` : "Not configured"}
                </Badge>
              </div>
              <CardDescription className="mt-1 max-w-2xl">
                Deterministic local scoring. Every point is explained, costs no AI tokens, and can be corrected by a human.
              </CardDescription>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 text-center">
            <div className="bg-black px-3 py-2"><p className="font-mono text-xs text-zinc-200">70–100</p><p className="text-[9px] tracking-wider text-zinc-600 uppercase">High</p></div>
            <div className="bg-black px-3 py-2"><p className="font-mono text-xs text-zinc-200">40–69</p><p className="text-[9px] tracking-wider text-zinc-600 uppercase">Review</p></div>
            <div className="bg-black px-3 py-2"><p className="font-mono text-xs text-zinc-200">0–39</p><p className="text-[9px] tracking-wider text-zinc-600 uppercase">Low</p></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_1fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="icp-name">Profile name <span aria-hidden="true" className="text-zinc-500">*</span></Label>
              <Input id="icp-name" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icp-keywords">Target keywords <span className="text-zinc-600">· +20</span></Label>
              <Textarea aria-describedby={error ? "icp-error" : undefined} className="min-h-20 resize-none" id="icp-keywords" maxLength={3_000} onChange={(event) => setTargetKeywords(event.target.value)} placeholder="dentist, SaaS agency, property management" value={targetKeywords} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icp-locations">Target locations <span className="text-zinc-600">· +15</span></Label>
              <Textarea aria-describedby={error ? "icp-error" : undefined} className="min-h-20 resize-none" id="icp-locations" maxLength={3_000} onChange={(event) => setTargetLocations(event.target.value)} placeholder="Karachi, Lahore, Pakistan" value={targetLocations} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icp-exclusions">Exclude keywords <span className="text-zinc-600">· −35</span></Label>
              <Textarea className="min-h-20 resize-none" id="icp-exclusions" maxLength={3_000} onChange={(event) => setExcludedKeywords(event.target.value)} placeholder="student, nonprofit, directory" value={excludedKeywords} />
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-zinc-900 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-52 cursor-pointer items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black px-3 py-2.5 text-xs text-zinc-400" htmlFor="icp-require-website">
                <span><span className="block font-medium text-zinc-300">Require website</span><span className="mt-0.5 block text-[10px] text-zinc-600">Missing costs 20 points</span></span>
                <Switch checked={requireWebsite} id="icp-require-website" onCheckedChange={setRequireWebsite} />
              </label>
              <label className="flex min-w-52 cursor-pointer items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black px-3 py-2.5 text-xs text-zinc-400" htmlFor="icp-require-contact">
                <span><span className="block font-medium text-zinc-300">Require direct contact</span><span className="mt-0.5 block text-[10px] text-zinc-600">Missing costs 25 points</span></span>
                <Switch checked={requireContact} id="icp-require-contact" onCheckedChange={setRequireContact} />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4 lg:justify-end">
              <div aria-live="polite" className="text-[11px]">
                {error ? <p className="text-red-300" id="icp-error" role="alert">{error}</p> : profile.configured ? <p className="flex items-center gap-1.5 text-zinc-500"><CheckCircle2 className="size-3 text-emerald-400" />Last profile saved locally</p> : <p className="text-zinc-600">Comma or line separated values</p>}
              </div>
              <Button disabled={saving} type="submit">
                {saving ? <Loader2 className="animate-spin" /> : profile.configured ? <RefreshCw /> : <SlidersHorizontal />}
                {saving ? "Rescoring…" : profile.configured ? "Save & rescore" : "Activate scoring"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
