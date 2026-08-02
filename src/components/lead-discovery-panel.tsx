"use client";

import {
  Check,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  MapPinned,
  Radar,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson } from "@/lib/api";
import type {
  ConnectorAccount,
  GooglePlaceResult,
  GooglePlacesSearchResponse,
  LeadImportResult,
  PublicAppState,
  WebsiteCrawlResult,
} from "@/lib/app-types";
import { cn } from "@/lib/utils";

type StateResponse = { ok: boolean; state: PublicAppState };

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function statusLabel(account: ConnectorAccount | null) {
  if (!account) return "Not configured";
  if (account.status === "verified" && account.enabled) return "Verified";
  if (account.status === "error") return "Needs attention";
  if (!account.enabled) return "Disabled";
  return "Saved";
}

export function LeadDiscoveryPanel({
  state,
  onStateChange,
  onImported,
}: {
  state: PublicAppState;
  onStateChange: (state: PublicAppState) => void;
  onImported: () => Promise<void>;
}) {
  const account = useMemo(
    () => state.connectors.accounts.find((item) => item.adapterId === "google-places") ?? null,
    [state.connectors.accounts],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [showConnection, setShowConnection] = useState(!account);
  const [connection, setConnection] = useState({
    name: account?.name ?? "Google Places discovery",
    regionCode: String(account?.config.region_code ?? "PK"),
    languageCode: String(account?.config.language_code ?? "en"),
    apiKey: "",
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GooglePlaceResult[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [crawl, setCrawl] = useState<WebsiteCrawlResult | null>(null);

  async function saveAndTest(event: FormEvent) {
    event.preventDefault();
    setBusy("connection");
    try {
      const secrets = connection.apiKey.trim() ? { api_key: connection.apiKey.trim() } : {};
      const saved = await requestJson<StateResponse & { account: ConnectorAccount }>(
        account ? `/api/connectors/${account.id}` : "/api/connectors",
        {
          method: account ? "PUT" : "POST",
          body: JSON.stringify({
            adapterId: "google-places",
            name: connection.name,
            config: {
              region_code: connection.regionCode,
              language_code: connection.languageCode,
            },
            secrets,
            scopes: ["places:search"],
            enabled: true,
          }),
        },
      );
      const tested = await requestJson<StateResponse & { ok: boolean; message: string }>(
        `/api/connectors/${saved.account.id}/test`,
        { method: "POST" },
      );
      onStateChange(tested.state);
      if (!tested.ok) throw new Error(tested.message);
      setConnection((current) => ({ ...current, apiKey: "" }));
      setShowConnection(false);
      toast.success("Google Places connected", { description: tested.message });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google Places connection failed.");
    } finally {
      setBusy(null);
    }
  }

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    setBusy("places");
    setResults([]);
    try {
      const response = await requestJson<GooglePlacesSearchResponse>("/api/leads/discover/google-places", {
        method: "POST",
        body: JSON.stringify({ query, pageSize: 10 }),
        cache: "no-store",
      });
      setResults(response.results);
      if (response.results.length === 0) toast.info("Google Maps returned no matching places.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Place discovery failed.");
    } finally {
      setBusy(null);
    }
  }

  async function scanWebsite(event?: FormEvent, selectedUrl?: string) {
    event?.preventDefault();
    const target = selectedUrl || websiteUrl;
    if (!target.trim()) return;
    setWebsiteUrl(target);
    setBusy("crawl");
    setCrawl(null);
    try {
      const response = await requestJson<{ ok: boolean; result: WebsiteCrawlResult }>("/api/leads/crawl", {
        method: "POST",
        body: JSON.stringify({ url: target }),
        cache: "no-store",
      });
      setCrawl(response.result);
      toast.success(`Scanned ${response.result.pages.length} public page${response.result.pages.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website crawl failed.");
    } finally {
      setBusy(null);
    }
  }

  async function importCrawl() {
    if (!crawl) return;
    setBusy("crawl-import");
    try {
      const response = await requestJson<{ ok: boolean; result: LeadImportResult; state: PublicAppState }>(
        "/api/leads/import",
        {
          method: "POST",
          body: JSON.stringify({
            source: "website-crawl",
            rows: [{
              businessName: crawl.businessName,
              website: crawl.website,
              email: crawl.email,
              phone: crawl.phone,
              location: crawl.location,
              sourceRef: crawl.sourceRef,
              notes: crawl.notes,
            }],
          }),
        },
      );
      onStateChange(response.state);
      await onImported();
      toast.success(response.result.created ? "Website lead added" : "Website evidence merged");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the website lead.");
    } finally {
      setBusy(null);
    }
  }

  const verified = account?.status === "verified" && account.enabled;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md border border-zinc-700 bg-black text-zinc-200"><Radar className="size-4" /></div>
            <div><CardTitle>Compliant lead discovery</CardTitle><CardDescription>Official place search, then robots-aware public website extraction.</CardDescription></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn(verified ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-300" : "border-zinc-700 text-zinc-400")} variant="outline">{statusLabel(account)}</Badge>
            <Button onClick={() => setShowConnection((current) => !current)} size="sm" variant="ghost"><KeyRound />{showConnection ? "Close" : "Connection"}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {showConnection ? (
          <form className="rounded-lg border border-zinc-800 bg-black p-4" onSubmit={saveAndTest}>
            <div className="mb-4 flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 text-emerald-400" /><div><p className="text-xs font-medium text-zinc-200">Encrypted local API key</p><p className="mt-1 text-[11px] leading-5 text-zinc-600">Use a restricted key with Places API (New). Search results are transient and are not written to SQLite.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="places-name">Connection name</Label><Input id="places-name" maxLength={120} onChange={(event) => setConnection((current) => ({ ...current, name: event.target.value }))} required value={connection.name} /></div>
              <div className="space-y-2"><Label htmlFor="places-region">Region code</Label><Input id="places-region" maxLength={2} onChange={(event) => setConnection((current) => ({ ...current, regionCode: event.target.value.toUpperCase() }))} placeholder="PK" value={connection.regionCode} /></div>
              <div className="space-y-2"><Label htmlFor="places-language">Language</Label><Input id="places-language" maxLength={10} onChange={(event) => setConnection((current) => ({ ...current, languageCode: event.target.value }))} placeholder="en" value={connection.languageCode} /></div>
              <div className="space-y-2"><Label htmlFor="places-key">API key</Label><Input autoComplete="new-password" id="places-key" onChange={(event) => setConnection((current) => ({ ...current, apiKey: event.target.value }))} placeholder={account?.secretStatus.api_key ? "Stored — blank keeps it" : "AIza…"} required={!account?.secretStatus.api_key} type="password" value={connection.apiKey} /></div>
            </div>
            {account?.lastError ? <p className="mt-3 text-xs text-red-300">{account.lastError}</p> : null}
            <div className="mt-4 flex justify-end"><Button disabled={busy === "connection"} type="submit">{busy === "connection" ? <Loader2 className="animate-spin" /> : <Check />}Save & test</Button></div>
          </form>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={searchPlaces}>
              <div><Label htmlFor="places-query">Find businesses with Google Places</Label><p className="mt-1 text-[11px] text-zinc-600">Example: dentists in Lahore or software agencies in Karachi</p></div>
              <div className="flex gap-2"><Input disabled={!verified} id="places-query" maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder={verified ? "Business type and location" : "Connect and verify Google Places first"} required value={query} /><Button disabled={!verified || !query.trim() || busy === "places"} type="submit">{busy === "places" ? <Loader2 className="animate-spin" /> : <MapPinned />}Search</Button></div>
            </form>

            {results.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
                <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3"><p className="text-xs font-medium text-zinc-300">Transient results</p><span className="text-xs font-normal whitespace-nowrap text-zinc-300" translate="no">Google Maps</span></div>
                <div className="max-h-[390px] divide-y divide-zinc-900 overflow-y-auto">
                  {results.map((place) => {
                    const website = safeHttpUrl(place.website);
                    const mapsUrl = safeHttpUrl(place.googleMapsUri);
                    return (
                      <div className="space-y-3 p-4" key={place.placeId}>
                        <div><p className="text-xs font-medium text-zinc-200">{place.name || "Unnamed place"}</p><p className="mt-1 text-[11px] leading-4 text-zinc-600">{place.address}</p>{place.phone ? <p className="mt-1 text-[11px] text-zinc-500">{place.phone}</p> : null}</div>
                        {place.attributions.map((item) => <a className="block text-[10px] text-zinc-600 hover:text-zinc-300" href={safeHttpUrl(item.providerUri) ?? undefined} key={`${place.placeId}-${item.provider}`} rel="noreferrer" target="_blank">Data: {item.provider}</a>)}
                        <div className="flex flex-wrap gap-2">{website ? <Button disabled={busy === "crawl"} onClick={() => void scanWebsite(undefined, website)} size="sm" variant="outline"><ScanSearch />Crawl public site</Button> : null}{mapsUrl ? <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={mapsUrl} rel="noreferrer" target="_blank">View on Maps<ExternalLink /></a> : null}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-zinc-900 px-4 py-3 text-[10px] leading-4 text-zinc-600">Ranked by Google Maps using factors including relevance, distance and prominence. Results disappear on refresh and are not stored. <a className="text-zinc-400 hover:text-zinc-200" href="https://support.google.com/business/answer/7091" rel="noreferrer" target="_blank">Learn more</a>. Use is subject to the <a className="text-zinc-400 hover:text-zinc-200" href="https://cloud.google.com/maps-platform/terms" rel="noreferrer" target="_blank">Google Maps terms</a> and <a className="text-zinc-400 hover:text-zinc-200" href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">Google Privacy Policy</a>.</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
            <form className="space-y-3" onSubmit={(event) => void scanWebsite(event)}>
              <div className="flex items-start gap-3"><Globe2 className="mt-0.5 size-4 text-zinc-400" /><div><Label htmlFor="website-crawl">Public website contact scan</Label><p className="mt-1 text-[11px] leading-5 text-zinc-600">Checks robots.txt, public IPs, redirect domain, page size and content type. Up to four same-site pages.</p></div></div>
              <div className="flex gap-2"><Input id="website-crawl" maxLength={2048} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" required value={websiteUrl} /><Button disabled={!websiteUrl.trim() || busy === "crawl"} type="submit" variant="outline">{busy === "crawl" ? <Loader2 className="animate-spin" /> : <ScanSearch />}Scan</Button></div>
            </form>

            {crawl ? (
              <div className="space-y-4 border-t border-zinc-900 pt-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-zinc-100">{crawl.businessName}</p><p className="mt-1 text-[11px] text-zinc-600">{crawl.pages.length} allowed page{crawl.pages.length === 1 ? "" : "s"} scanned</p></div><Badge className="border-emerald-500/25 bg-emerald-500/8 text-emerald-300" variant="outline"><ShieldCheck />robots respected</Badge></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-zinc-900 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-700">Email</p><p className="mt-1 truncate text-xs text-zinc-300">{crawl.email || "Not found"}</p></div>
                  <div className="rounded-md border border-zinc-900 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-700">Phone</p><p className="mt-1 truncate text-xs text-zinc-300">{crawl.phone || "Not found"}</p></div>
                </div>
                <div className="flex items-center justify-between gap-3"><p className="max-w-sm text-[10px] leading-4 text-zinc-600">Only website-derived fields are stored. Google Maps content stays transient.</p><Button disabled={busy === "crawl-import"} onClick={() => void importCrawl()}>{busy === "crawl-import" ? <Loader2 className="animate-spin" /> : <Check />}Add to vault</Button></div>
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-zinc-800 text-center"><div><ScanSearch className="mx-auto size-5 text-zinc-700" /><p className="mt-2 text-xs text-zinc-500">No website scanned yet</p></div></div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
