import { NextResponse } from "next/server";

import { apiError, cleanText } from "@/server/http";
import { appendAudit, toPublicState, updateDatabase } from "@/server/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const next = await updateDatabase((database) => {
      const post = database.posts.find((item) => item.id === id);
      if (!post) throw new Error("Draft not found.");
      if (post.status === "published") throw new Error("Published content is immutable. Create a new draft instead.");
      if (post.status === "publishing") throw new Error("This draft is currently being published.");
      post.title = cleanText(body.title, 160, true);
      post.body = cleanText(body.body, 12_000, true);
      post.hashtags = Array.isArray(body.hashtags)
        ? body.hashtags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 20)
        : post.hashtags;
      post.status = "pending";
      post.revision += 1;
      post.approvedAt = null;
      post.publishedAt = null;
      post.remoteId = null;
      post.updatedAt = new Date().toISOString();
      post.lastError = null;
      appendAudit(database, {
        action: "post.edited",
        entityType: "post",
        entityId: post.id,
        summary: "Draft edited; prior approval invalidated.",
      });
      return database;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    return apiError(error);
  }
}
