"use client";

import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  X,
} from "lucide-react";
import type { FormEvent } from "react";

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

export type WordPressConnectorForm = {
  name: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  enabled: boolean;
};

type Props = {
  account: ConnectorAccount | null;
  busy: string | null;
  form: WordPressConnectorForm;
  onChange: (patch: Partial<WordPressConnectorForm>) => void;
  onRemove: () => void;
  onSave: (event: FormEvent) => void;
  onTest: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function wordpressProfileUrl(siteUrl: string) {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/$/, "")}/wp-admin/profile.php`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function Field({
  children,
  hint,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
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
    ? "Ready to publish"
    : account?.status === "error"
      ? "Needs attention"
      : account
        ? "Saved"
        : "Not configured";
  return (
    <Badge
      className={cn(
        account?.status === "verified" && "border-emerald-500/25 bg-emerald-500/8 text-emerald-300",
        account?.status === "error" && "border-red-500/25 bg-red-500/8 text-red-300",
        (!account || account.status === "saved") && "border-zinc-700 text-zinc-400",
      )}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

export function WordPressConnectorCard({
  account,
  busy,
  form,
  onChange,
  onRemove,
  onSave,
  onTest,
}: Props) {
  const saving = busy === "wordpress-save";
  const testing = busy === "wordpress-test";
  const deleting = busy === "wordpress-delete";
  const profileUrl = wordpressProfileUrl(form.siteUrl);

  return (
    <Card className="overflow-hidden border-zinc-800 bg-[#070707]">
      <CardHeader className="border-b border-zinc-900 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_34%)]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <Globe2 className="size-4" />
          </div>
          <div>
            <CardTitle>WordPress publisher</CardTitle>
            <CardDescription>Official REST API publishing for approved Blog drafts.</CardDescription>
          </div>
        </div>
        <CardAction><StatusBadge account={account} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="wordpress-name" label="Connection name">
              <Input
                id="wordpress-name"
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Company blog"
                required
                value={form.name}
              />
            </Field>
            <Field htmlFor="wordpress-site-url" hint="HTTPS for remote sites" label="Site URL">
              <Input
                id="wordpress-site-url"
                maxLength={2048}
                onChange={(event) => onChange({ siteUrl: event.target.value })}
                placeholder="https://example.com"
                required
                type="url"
                value={form.siteUrl}
              />
            </Field>
            <Field
              htmlFor="wordpress-username"
              hint={account?.secretStatus.username ? "Stored securely — blank keeps it" : "WordPress user"}
              label="Username"
            >
              <Input
                autoComplete="off"
                id="wordpress-username"
                onChange={(event) => onChange({ username: event.target.value })}
                placeholder={account?.secretStatus.username ? "Stored in local vault" : "editor"}
                required={!account?.secretStatus.username}
                value={form.username}
              />
            </Field>
            <Field
              htmlFor="wordpress-application-password"
              hint={account?.secretStatus.application_password ? "Stored securely — blank keeps it" : "Not your login password"}
              label="Application Password"
            >
              <Input
                autoComplete="new-password"
                id="wordpress-application-password"
                onChange={(event) => onChange({ applicationPassword: event.target.value })}
                placeholder={account?.secretStatus.application_password ? "••••••••••••••••" : "xxxx xxxx xxxx xxxx"}
                required={!account?.secretStatus.application_password}
                type="password"
                value={form.applicationPassword}
              />
              <CredentialHelp
                description="Sign in to WordPress, open Users → Profile, find Application Passwords, name it Socium, and copy the generated password. Never enter your normal login password."
                primary={{ href: profileUrl ?? "https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/", label: profileUrl ? "Open WP profile" : "Application password guide" }}
                secondary={profileUrl ? { href: "https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/", label: "Official guide" } : undefined}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black p-3">
            <div>
              <Label className="text-xs text-zinc-200" htmlFor="wordpress-enabled">Connector enabled</Label>
              <p className="mt-1 text-[11px] leading-4 text-zinc-600">Only verified, enabled accounts can publish Blog drafts.</p>
            </div>
            <Switch
              checked={form.enabled}
              id="wordpress-enabled"
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
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Save & test
              </Button>
            </div>
          </div>
        </form>

        <div className="space-y-4 rounded-md border border-zinc-800 bg-black p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-zinc-200">Approval-locked publishing</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">Only the exact approved revision is sent. Editing resets approval automatically.</p>
            </div>
          </div>
          <Separator className="bg-zinc-900" />
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Encrypted local credentials</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">Username and Application Password stay AES-256-GCM encrypted on this computer.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-zinc-900 p-3">
              <p className="text-zinc-600">Username</p>
              <p className={cn("mt-1", account?.secretStatus.username ? "text-emerald-300" : "text-zinc-500")}>
                {account?.secretStatus.username ? "Stored" : "Missing"}
              </p>
            </div>
            <div className="rounded-md border border-zinc-900 p-3">
              <p className="text-zinc-600">App password</p>
              <p className={cn("mt-1", account?.secretStatus.application_password ? "text-emerald-300" : "text-zinc-500")}>
                {account?.secretStatus.application_password ? "Stored" : "Missing"}
              </p>
            </div>
          </div>
          <div className="rounded-md border border-zinc-900 p-3">
            <div className="flex items-center gap-2 text-xs text-zinc-300"><FileText className="size-3.5" /> posts:write</div>
            <p className="mt-1 text-[11px] leading-5 text-zinc-600">Socium capability scope required by this adapter.</p>
          </div>
          {account?.lastVerifiedAt ? <p className="font-mono text-[10px] text-zinc-600">Last verified {formatDate(account.lastVerifiedAt)}</p> : null}
          <a
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
            href="https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/"
            rel="noreferrer"
            target="_blank"
          >
            WordPress Application Password guide <ExternalLink className="size-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
