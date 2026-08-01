import { NextResponse } from "next/server";

import type { ProviderKind } from "@/lib/app-types";
import { apiError, cleanText, cleanUrl } from "@/server/http";
import { appendAudit, encryptSecret, toPublicState, updateDatabase } from "@/server/store";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const kind = body.kind as ProviderKind;
    if (!['ollama', 'openai-compatible'].includes(kind)) throw new Error("Unsupported provider type.");
    const apiKey = cleanText(body.apiKey, 2_000);
    const baseUrl = cleanUrl(body.baseUrl);
    const next = await updateDatabase(async (database) => {
      const sameEndpoint = database.provider.kind === kind && database.provider.baseUrl === baseUrl;
      database.provider = {
        kind,
        baseUrl,
        model: cleanText(body.model, 180, true),
        apiKey: apiKey ? await encryptSecret(apiKey) : sameEndpoint ? database.provider.apiKey : null,
        updatedAt: new Date().toISOString(),
      };
      appendAudit(database, {
        action: "provider.updated",
        entityType: "provider",
        entityId: kind,
        summary: `${kind} provider settings saved.`,
      });
      return database;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    return apiError(error);
  }
}
