import { NextResponse } from "next/server";

import type { GeneratedPost } from "@/lib/app-types";
import { apiError } from "@/server/http";
import {
  appendAudit,
  decryptSecret,
  readDatabase,
  toPublicState,
  updateDatabase,
} from "@/server/store";
import { publishTelegramPost } from "@/server/telegram";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let reservedRevision: number | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { revision?: number };
    if (!Number.isInteger(body.revision)) throw new Error("Draft revision is required.");

    let reservedPost: GeneratedPost | null = null;
    await updateDatabase((current) => {
      const post = current.posts.find((item) => item.id === id);
      if (!post) throw new Error("Draft not found.");
      if (post.revision !== body.revision) throw new Error("This draft changed. Review the latest revision before publishing.");
      if (post.status !== "approved") throw new Error("Approve this exact draft version before publishing.");
      if (post.channel !== "telegram") {
        throw new Error(`${post.channel} publisher is not installed yet. Telegram publishing is available now.`);
      }
      post.status = "publishing";
      post.updatedAt = new Date().toISOString();
      post.lastError = null;
      reservedRevision = post.revision;
      reservedPost = structuredClone(post);
      appendAudit(current, {
        action: "post.publish_reserved",
        entityType: "publisher",
        entityId: post.id,
        summary: `Telegram publish reserved for revision ${post.revision}.`,
      });
      return current;
    });

    if (!reservedPost || reservedRevision === null) throw new Error("Could not reserve this draft for publishing.");
    const database = await readDatabase();
    const token = await decryptSecret(database.telegram.botToken);
    if (!token || !database.telegram.chatId) throw new Error("Connect Telegram before publishing.");

    const result = await publishTelegramPost(token, database.telegram.chatId, reservedPost);
    const next = await updateDatabase((current) => {
      const post = current.posts.find((item) => item.id === id);
      if (!post || post.revision !== reservedRevision || post.status !== "publishing") {
        throw new Error("Publish reservation no longer matches the current draft.");
      }
      post.status = "published";
      post.publishedAt = new Date().toISOString();
      post.updatedAt = post.publishedAt;
      post.remoteId = String(result.message_id);
      post.lastError = null;
      appendAudit(current, {
        action: "post.published",
        entityType: "publisher",
        entityId: post.id,
        summary: `Revision ${post.revision} published to Telegram as message ${result.message_id}.`,
      });
      return current;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    if (reservedRevision !== null) {
      await updateDatabase((current) => {
        const post = current.posts.find((item) => item.id === id);
        if (post && post.revision === reservedRevision && post.status === "publishing") {
          post.status = "approved";
          post.lastError = error instanceof Error ? error.message : "Publish failed.";
          post.updatedAt = new Date().toISOString();
          appendAudit(current, {
            action: "post.publish_failed",
            entityType: "publisher",
            entityId: post.id,
            summary: `Telegram publish failed for revision ${post.revision}.`,
          });
        }
        return current;
      }).catch(() => undefined);
    }
    return apiError(error, "Publish failed.", 502);
  }
}
