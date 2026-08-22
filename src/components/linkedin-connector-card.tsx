"use client";

import {
  AlertTriangle,
  BriefcaseBusiness,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { CredentialHelp } from "@/components/credential-help";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { ConnectorAccount } from "@/lib/app-types";
import { cn } from "@/lib/utils";

export type LinkedInConnectorForm = {
  name: string;
  personId: string;
  apiVersion: string;
  accessToken: string;
  enabled: boolean;
};

type Props = {
  account: ConnectorAccount | null;
  busy: string | null;
  form: LinkedInConnectorForm;
  onChange: (patch: Partial<LinkedInConnectorForm>) => void;
  onRemove: () => void;
  onSave: (event: FormEvent) => void;
  onTest: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function Field({
  children,
  hint,
  htmlFor,
  label,
}: {
  children: ReactNode;
  hint?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs text-zinc-300" htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="text-[10px] text-zinc-600">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ account }: { account: ConnectorAccount | null }) {
  const label = account?.status === "verified"
    ? "Ready for text posts"
    : account?.status === "error"
      ? "Needs attention"
      : account
        ? "Saved"
        : "Not configured";
  return (
    <Badge
      className={cn(
        account?.status === "verified" && "border-sky-500/25 bg-sky-500/8 text-sky-300",
        account?.status === "error" && "border-red-500/25 bg-red-500/8 text-red-300",
        (!account || account.status === "saved") && "border-zinc-700 text-zinc-400",
      )}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

export function LinkedInConnectorCard({
  account,
  busy,
  form,
  onChange,
  onRemove,
  onSave,
  onTest,
}: Props) {
  const saving = busy === "linkedin-save";
  const testing = busy === "linkedin-test";
  const deleting = busy === "linkedin-delete";

  return (
    <Card className="overflow-hidden border-zinc-800 bg-[#070707]">
      <CardHeader className="border-b border-zinc-900 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_34%)]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md border border-sky-500/20 bg-sky-500/5 text-sky-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <BriefcaseBusiness className="size-4" />
          </div>
          <div>
            <CardTitle>LinkedIn Member publisher</CardTitle>
            <CardDescription>Official Posts API for approved public text posts.</CardDescription>
          </div>
        </div>
        <CardAction><StatusBadge account={account} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="linkedin-name" label="Connection name">
              <Input
                id="linkedin-name"
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="My LinkedIn profile"
                required
                value={form.name}
              />
            </Field>
            <Field htmlFor="linkedin-person-id" hint="OIDC userinfo sub" label="LinkedIn Member ID">
              <Input
                id="linkedin-person-id"
                maxLength={128}
                onChange={(event) => onChange({ personId: event.target.value })}
                pattern="[A-Za-z0-9_-]{2,128}"
                placeholder="782bbtaQ"
                required
                value={form.personId}
              />
            </Field>
            <Field htmlFor="linkedin-api-version" hint="YYYYMM, deliberately pinned" label="LinkedIn API version">
              <Input
                id="linkedin-api-version"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => onChange({ apiVersion: event.target.value })}
                pattern="20[0-9]{4}"
                placeholder="202607"
                required
                value={form.apiVersion}
              />
            </Field>
            <Field
              htmlFor="linkedin-access-token"
              hint={account?.secretStatus.access_token ? "Stored securely — blank keeps it" : "3-legged OAuth token"}
              label="OAuth Access Token"
            >
              <Input
                autoComplete="new-password"
                id="linkedin-access-token"
                onChange={(event) => onChange({ accessToken: event.target.value })}
                placeholder={account?.secretStatus.access_token ? "••••••••••••••••" : "AQV…"}
                required={!account?.secretStatus.access_token}
                type="password"
                value={form.accessToken}
              />
              <CredentialHelp
                description="Create/open a LinkedIn app, enable Share on LinkedIn, then use LinkedIn's OAuth Token Generator and approve the requested member scopes."
                primary={{ href: "https://www.linkedin.com/developers/tools/oauth/token-generator", label: "Token generator" }}
                secondary={{ href: "https://www.linkedin.com/developers/apps", label: "LinkedIn apps" }}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black p-3">
            <div>
              <Label className="text-xs text-zinc-200" htmlFor="linkedin-enabled">Connector enabled</Label>
              <p className="mt-1 text-[11px] leading-4 text-zinc-600">Only a verified, enabled member can publish approved revisions.</p>
            </div>
            <Switch
              checked={form.enabled}
              id="linkedin-enabled"
              onCheckedChange={(enabled) => onChange({ enabled })}
            />
          </div>

          {account?.lastError ? (
            <div className="flex gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{account.lastError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-4">
            <div>
              {account ? (
                <Button disabled={deleting} onClick={onRemove} type="button" variant="ghost">
                  <X /> Remove
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || testing} type="submit" variant="outline">
                {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
              </Button>
              <Button disabled={saving || testing} onClick={onTest} type="button">
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Save &amp; test
              </Button>
            </div>
          </div>
        </form>

        <div className="space-y-4 rounded-md border border-zinc-800 bg-black p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-400" />
            <div>
              <p className="text-xs font-medium text-zinc-200">Member-authorized publishing</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">The token must come from LinkedIn 3-legged OAuth with explicit member consent.</p>
            </div>
          </div>
          <Separator className="bg-zinc-900" />
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Official API only</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">No browser cookies, profile scraping, password capture, or simulated clicks are used.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Encrypted OAuth token</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">The token stays AES-256-GCM encrypted locally and is never returned to the browser.</p>
            </div>
          </div>
          <div className="rounded-md border border-zinc-900 p-3 text-xs">
            <p className="text-zinc-600">OAuth Access Token</p>
            <p className={cn("mt-1", account?.secretStatus.access_token ? "text-sky-300" : "text-zinc-500")}>
              {account?.secretStatus.access_token ? "Stored" : "Missing"}
            </p>
          </div>
          <div className="rounded-md border border-zinc-900 p-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase">Required permissions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">openid</Badge>
              <Badge variant="outline">profile</Badge>
              <Badge variant="outline">w_member_social</Badge>
            </div>
          </div>
          {account?.lastVerifiedAt ? <p className="font-mono text-[10px] text-zinc-600">Last verified {formatDate(account.lastVerifiedAt)}</p> : null}
          <div className="flex flex-col items-start gap-2">
            <a className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200" href="https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api" rel="noreferrer" target="_blank">Official Posts API guide <ExternalLink className="size-3" /></a>
            <a className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200" href="https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow" rel="noreferrer" target="_blank">Official OAuth guide <ExternalLink className="size-3" /></a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
