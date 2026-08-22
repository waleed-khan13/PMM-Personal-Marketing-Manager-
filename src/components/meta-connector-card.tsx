"use client";

import {
  AlertTriangle,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  Megaphone,
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

export type MetaConnectorForm = {
  name: string;
  pageId: string;
  apiVersion: string;
  pageAccessToken: string;
  enabled: boolean;
};

type Props = {
  account: ConnectorAccount | null;
  busy: string | null;
  form: MetaConnectorForm;
  onChange: (patch: Partial<MetaConnectorForm>) => void;
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
    ? "Ready to publish"
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

export function MetaConnectorCard({
  account,
  busy,
  form,
  onChange,
  onRemove,
  onSave,
  onTest,
}: Props) {
  const saving = busy === "meta-save";
  const testing = busy === "meta-test";
  const deleting = busy === "meta-delete";

  return (
    <Card className="overflow-hidden border-zinc-800 bg-[#070707]">
      <CardHeader className="border-b border-zinc-900 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_34%)]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md border border-sky-500/20 bg-sky-500/5 text-sky-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <Megaphone className="size-4" />
          </div>
          <div>
            <CardTitle>Facebook Page publisher</CardTitle>
            <CardDescription>Official Meta Graph API publishing for approved Facebook drafts.</CardDescription>
          </div>
        </div>
        <CardAction><StatusBadge account={account} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="meta-name" label="Connection name">
              <Input
                id="meta-name"
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Company Facebook Page"
                required
                value={form.name}
              />
            </Field>
            <Field htmlFor="meta-page-id" hint="Numeric Page ID" label="Facebook Page ID">
              <Input
                id="meta-page-id"
                inputMode="numeric"
                maxLength={32}
                onChange={(event) => onChange({ pageId: event.target.value })}
                pattern="[0-9]{5,32}"
                placeholder="123456789012345"
                required
                value={form.pageId}
              />
            </Field>
            <Field htmlFor="meta-api-version" hint="Deliberately pinned" label="Graph API version">
              <Input
                id="meta-api-version"
                maxLength={16}
                onChange={(event) => onChange({ apiVersion: event.target.value })}
                pattern="v[0-9]+\.[0-9]+"
                placeholder="v25.0"
                required
                value={form.apiVersion}
              />
            </Field>
            <Field
              htmlFor="meta-page-access-token"
              hint={account?.secretStatus.page_access_token ? "Stored securely — blank keeps it" : "Page token, not a user token"}
              label="Page Access Token"
            >
              <Input
                autoComplete="new-password"
                id="meta-page-access-token"
                onChange={(event) => onChange({ pageAccessToken: event.target.value })}
                placeholder={account?.secretStatus.page_access_token ? "••••••••••••••••" : "EAAB…"}
                required={!account?.secretStatus.page_access_token}
                type="password"
                value={form.pageAccessToken}
              />
              <CredentialHelp
                description="Create/open a Meta app, add Facebook Login/Pages permissions, then use Graph API Explorer to obtain a Page token for this Page."
                primary={{ href: "https://developers.facebook.com/tools/explorer/", label: "Graph API Explorer" }}
                secondary={{ href: "https://developers.facebook.com/apps/", label: "Meta apps" }}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black p-3">
            <div>
              <Label className="text-xs text-zinc-200" htmlFor="meta-enabled">Connector enabled</Label>
              <p className="mt-1 text-[11px] leading-4 text-zinc-600">Only a verified, enabled Page can publish Facebook drafts.</p>
            </div>
            <Switch
              checked={form.enabled}
              id="meta-enabled"
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
              <p className="text-xs font-medium text-zinc-200">Approval-locked publishing</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">Only the exact approved revision reaches the Page feed. Editing resets approval.</p>
            </div>
          </div>
          <Separator className="bg-zinc-900" />
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Encrypted Page token</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">The Page Access Token stays AES-256-GCM encrypted on this computer and is never returned to the browser.</p>
            </div>
          </div>
          <div className="rounded-md border border-zinc-900 p-3 text-xs">
            <p className="text-zinc-600">Page Access Token</p>
            <p className={cn("mt-1", account?.secretStatus.page_access_token ? "text-sky-300" : "text-zinc-500")}>
              {account?.secretStatus.page_access_token ? "Stored" : "Missing"}
            </p>
          </div>
          <div className="rounded-md border border-zinc-900 p-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase">Required permissions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">pages_read_engagement</Badge>
              <Badge variant="outline">pages_manage_posts</Badge>
            </div>
          </div>
          {account?.lastVerifiedAt ? <p className="font-mono text-[10px] text-zinc-600">Last verified {formatDate(account.lastVerifiedAt)}</p> : null}
          <a
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
            href="https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api"
            rel="noreferrer"
            target="_blank"
          >
            Official Meta Facebook API guide <ExternalLink className="size-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
