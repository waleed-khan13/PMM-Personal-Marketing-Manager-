"use client";

import {
  AlertTriangle,
  BellRing,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
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

export type WhatsAppConnectorForm = {
  name: string;
  phoneNumberId: string;
  recipientPhone: string;
  apiVersion: string;
  templateName: string;
  templateLanguage: string;
  accessToken: string;
  enabled: boolean;
};

type Props = {
  account: ConnectorAccount | null;
  busy: string | null;
  form: WhatsAppConnectorForm;
  onChange: (patch: Partial<WhatsAppConnectorForm>) => void;
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
    ? "Ready to notify"
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

export function WhatsAppConnectorCard({
  account,
  busy,
  form,
  onChange,
  onRemove,
  onSave,
  onTest,
}: Props) {
  const saving = busy === "whatsapp-save";
  const testing = busy === "whatsapp-test";
  const deleting = busy === "whatsapp-delete";

  return (
    <Card className="overflow-hidden border-emerald-950 bg-[#050706] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <CardHeader className="border-b border-emerald-950/80 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_38%)]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <MessageCircle className="size-4" />
          </div>
          <div>
            <CardTitle>WhatsApp draft notifications</CardTitle>
            <CardDescription>Approved-template alerts for a reviewer while Socium stays local.</CardDescription>
          </div>
        </div>
        <CardAction><StatusBadge account={account} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="whatsapp-name" label="Connection name">
              <Input
                id="whatsapp-name"
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Owner review number"
                required
                value={form.name}
              />
            </Field>
            <Field htmlFor="whatsapp-phone-id" hint="Meta numeric ID" label="Phone Number ID">
              <Input
                id="whatsapp-phone-id"
                inputMode="numeric"
                maxLength={32}
                onChange={(event) => onChange({ phoneNumberId: event.target.value })}
                pattern="[0-9]{5,32}"
                placeholder="123456789012345"
                required
                value={form.phoneNumberId}
              />
            </Field>
            <Field htmlFor="whatsapp-recipient" hint="Include country code" label="Review recipient">
              <Input
                id="whatsapp-recipient"
                inputMode="tel"
                maxLength={32}
                onChange={(event) => onChange({ recipientPhone: event.target.value })}
                placeholder="+923001234567"
                required
                value={form.recipientPhone}
              />
            </Field>
            <Field htmlFor="whatsapp-api-version" hint="Deliberately pinned" label="Graph API version">
              <Input
                id="whatsapp-api-version"
                maxLength={16}
                onChange={(event) => onChange({ apiVersion: event.target.value })}
                pattern="v[0-9]+\.[0-9]+"
                placeholder="v25.0"
                required
                value={form.apiVersion}
              />
            </Field>
            <Field htmlFor="whatsapp-template" hint="Approved in WhatsApp Manager" label="Template name">
              <Input
                id="whatsapp-template"
                maxLength={512}
                onChange={(event) => onChange({ templateName: event.target.value })}
                pattern="[a-z0-9_]+"
                placeholder="socium_draft_review"
                required
                value={form.templateName}
              />
            </Field>
            <Field htmlFor="whatsapp-language" hint="Exact approved locale" label="Template language">
              <Input
                id="whatsapp-language"
                maxLength={8}
                onChange={(event) => onChange({ templateLanguage: event.target.value })}
                pattern="[A-Za-z]{2,3}(_[A-Za-z]{2})?"
                placeholder="en_US"
                required
                value={form.templateLanguage}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                htmlFor="whatsapp-access-token"
                hint={account?.secretStatus.access_token ? "Stored securely — blank keeps it" : "Permanent system-user token"}
                label="Permanent access token"
              >
                <Input
                  autoComplete="new-password"
                  id="whatsapp-access-token"
                  onChange={(event) => onChange({ accessToken: event.target.value })}
                  placeholder={account?.secretStatus.access_token ? "••••••••••••••••" : "EAA…"}
                  required={!account?.secretStatus.access_token}
                  type="password"
                  value={form.accessToken}
                />
                <CredentialHelp
                  description="In Meta Business Settings create/select a system user, assign the WhatsApp app and assets, then generate a permanent token with WhatsApp permissions."
                  primary={{ href: "https://business.facebook.com/settings/system-users", label: "System users" }}
                  secondary={{ href: "https://developers.facebook.com/apps/", label: "Meta apps" }}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-black p-3">
            <div>
              <Label className="text-xs text-zinc-200" htmlFor="whatsapp-enabled">Connector enabled</Label>
              <p className="mt-1 text-[11px] leading-4 text-zinc-600">Only a verified connection can be selected during generation.</p>
            </div>
            <Switch checked={form.enabled} id="whatsapp-enabled" onCheckedChange={(enabled) => onChange({ enabled })} />
          </div>

          {account?.lastError ? (
            <div className="flex gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{account.lastError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-4">
            <div>
              {account ? <Button disabled={deleting} onClick={onRemove} type="button" variant="ghost"><X /> Remove</Button> : null}
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
            <BellRing className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-zinc-200">Notification only</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">WhatsApp receives a preview. Approve or reject from Socium, Telegram, or Slack.</p>
            </div>
          </div>
          <Separator className="bg-zinc-900" />
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Four template variables</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">Body variables must be: channel, title, revision, then draft excerpt.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Encrypted credential</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">The token stays AES-256-GCM encrypted on this computer and never returns to the browser.</p>
            </div>
          </div>
          <div className="rounded-md border border-zinc-900 p-3 text-xs">
            <p className="text-zinc-600">Permanent access token</p>
            <p className={cn("mt-1", account?.secretStatus.access_token ? "text-emerald-300" : "text-zinc-500")}>
              {account?.secretStatus.access_token ? "Stored" : "Missing"}
            </p>
          </div>
          <div className="rounded-md border border-zinc-900 p-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase">Required permissions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">whatsapp_business_messaging</Badge>
              <Badge variant="outline">whatsapp_business_management</Badge>
            </div>
          </div>
          {account?.lastVerifiedAt ? <p className="font-mono text-[10px] text-zinc-600">Last verified {formatDate(account.lastVerifiedAt)}</p> : null}
          <a
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
            href="https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api"
            rel="noreferrer"
            target="_blank"
          >
            Official WhatsApp Cloud API guide <ExternalLink className="size-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
