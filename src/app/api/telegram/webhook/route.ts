import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { apiError } from "@/server/http";
import { answerTelegramCallback } from "@/server/telegram";
import { appendAudit, decryptSecret, readDatabase, updateDatabase } from "@/server/store";

type TelegramUpdate = {
  update_id?: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id?: number } };
  };
};

function secretsMatch(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const database = await readDatabase();
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || await decryptSecret(database.telegram.webhookSecret);
    const providedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!expectedSecret || !secretsMatch(providedSecret, expectedSecret)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const callback = update.callback_query;
    if (!callback?.data || !Number.isInteger(update.update_id)) return NextResponse.json({ ok: true });
    const [namespace, decision, postId, rawRevision] = callback.data.split(":");
    const revision = Number(rawRevision);
    if (namespace !== "lg" || !['approve', 'reject'].includes(decision) || !postId || !Number.isInteger(revision)) {
      return NextResponse.json({ ok: true });
    }

    const configuredChat = database.telegram.chatId;
    const callbackChat = callback.message?.chat?.id;
    if (/^-?\d+$/.test(configuredChat) && String(callbackChat) !== configuredChat) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const token = await decryptSecret(database.telegram.botToken);
    const approved = decision === "approve";
    let answer = "This action was already processed.";
    await updateDatabase((current) => {
      if ((update.update_id as number) <= current.telegram.lastUpdateId) return current;
      current.telegram.lastUpdateId = update.update_id as number;
      const post = current.posts.find((item) => item.id === postId);
      if (!post) {
        answer = "Draft no longer exists.";
        return current;
      }
      if (post.revision !== revision) {
        answer = "Stale approval: review the latest draft revision.";
        return current;
      }
      if (post.status !== "pending") {
        answer = `Draft is already ${post.status}.`;
        return current;
      }
      post.status = approved ? "approved" : "rejected";
      post.approvedAt = approved ? new Date().toISOString() : null;
      post.updatedAt = new Date().toISOString();
      post.lastError = null;
      answer = approved ? `Revision ${revision} approved and locked.` : `Revision ${revision} rejected.`;
      appendAudit(current, {
        action: approved ? "post.approved.telegram" : "post.rejected.telegram",
        entityType: "post",
        entityId: post.id,
        summary: approved ? `Revision ${revision} approved from Telegram.` : `Revision ${revision} rejected from Telegram.`,
      });
      return current;
    });
    if (token) await answerTelegramCallback(token, callback.id, answer);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Telegram webhook failed.", 500);
  }
}
