import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { apiError, cleanUrl } from "@/server/http";
import { configureTelegramWebhook } from "@/server/telegram";
import { appendAudit, decryptSecret, encryptSecret, readDatabase, toPublicState, updateDatabase } from "@/server/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const publicUrl = new URL(cleanUrl(body.publicUrl));
    if (publicUrl.protocol !== "https:") throw new Error("Telegram webhooks require a public HTTPS URL.");
    publicUrl.pathname = "/api/telegram/webhook";
    publicUrl.search = "";
    publicUrl.hash = "";

    const database = await readDatabase();
    const token = await decryptSecret(database.telegram.botToken);
    if (!token || !database.telegram.chatId) throw new Error("Save and test Telegram before registering its webhook.");
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || randomBytes(32).toString("hex");
    await configureTelegramWebhook(token, publicUrl.toString(), secret);

    const next = await updateDatabase(async (current) => {
      current.telegram.webhookSecret = await encryptSecret(secret);
      current.telegram.webhookUrl = publicUrl.toString();
      current.telegram.lastUpdateId = 0;
      current.telegram.updatedAt = new Date().toISOString();
      appendAudit(current, {
        action: "telegram.webhook_registered",
        entityType: "settings",
        entityId: "telegram",
        summary: `Telegram callback webhook registered at ${publicUrl.host}.`,
      });
      return current;
    });
    return NextResponse.json({ ok: true, message: "Telegram approval buttons are now connected.", state: toPublicState(next) });
  } catch (error) {
    return apiError(error, "Telegram webhook registration failed.", 502);
  }
}
