import { NextResponse } from "next/server";

import { apiError } from "@/server/http";
import { appendAudit, toPublicState, updateDatabase } from "@/server/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { decision?: string; revision?: number };
    if (!['approve', 'reject'].includes(body.decision || "")) throw new Error("Invalid approval decision.");
    if (!Number.isInteger(body.revision)) throw new Error("Draft revision is required.");
    const approved = body.decision === "approve";
    const next = await updateDatabase((database) => {
      const post = database.posts.find((item) => item.id === id);
      if (!post) throw new Error("Draft not found.");
      if (post.revision !== body.revision) throw new Error("This draft changed. Review the latest revision before deciding.");
      if (post.status !== "pending") throw new Error(`Only pending drafts can be decided. Current status: ${post.status}.`);
      post.status = approved ? "approved" : "rejected";
      post.approvedAt = approved ? new Date().toISOString() : null;
      post.updatedAt = new Date().toISOString();
      post.lastError = null;
      appendAudit(database, {
        action: approved ? "post.approved" : "post.rejected",
        entityType: "post",
        entityId: post.id,
        summary: approved ? "Draft approved and version locked." : "Draft rejected.",
      });
      return database;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    return apiError(error);
  }
}
