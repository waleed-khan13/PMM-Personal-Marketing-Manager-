import { NextResponse } from "next/server";

import { apiError, cleanText } from "@/server/http";
import { appendAudit, encryptSecret, toPublicState, updateDatabase } from "@/server/store";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const botToken = cleanText(body.botToken, 2_000);
    const next = await updateDatabase(async (database) => {
      const preserveWebhook = !botToken;
      database.telegram = {
        chatId: cleanText(body.chatId, 160, true),
        botToken: botToken ? await encryptSecret(botToken) : database.telegram.botToken,
        webhookSecret: preserveWebhook ? database.telegram.webhookSecret : null,
        webhookUrl: preserveWebhook ? database.telegram.webhookUrl : "",
        lastUpdateId: preserveWebhook ? database.telegram.lastUpdateId : 0,
        updatedAt: new Date().toISOString(),
      };
      appendAudit(database, {
        action: "telegram.updated",
        entityType: "settings",
        entityId: "telegram",
        summary: "Telegram connection settings saved.",
      });
      return database;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    return apiError(error);
  }
}
