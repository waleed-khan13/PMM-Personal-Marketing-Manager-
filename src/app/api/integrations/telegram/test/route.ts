import { NextResponse } from "next/server";

import { apiError } from "@/server/http";
import { decryptSecret, readDatabase } from "@/server/store";
import { testTelegramConnection } from "@/server/telegram";

export async function POST() {
  try {
    const database = await readDatabase();
    const token = await decryptSecret(database.telegram.botToken);
    if (!token) throw new Error("Save a Telegram bot token first.");
    const bot = await testTelegramConnection(token);
    return NextResponse.json({ ok: true, message: `Connected to ${bot.name}.`, bot });
  } catch (error) {
    return apiError(error, "Telegram connection failed.", 502);
  }
}
