import { NextResponse } from "next/server";

import { apiError, cleanText } from "@/server/http";
import { appendAudit, toPublicState, updateDatabase } from "@/server/store";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const next = await updateDatabase((database) => {
      database.workspace = {
        name: cleanText(body.name, 80, true),
        businessName: cleanText(body.businessName, 120, true),
        description: cleanText(body.description, 2_000),
        timezone: cleanText(body.timezone, 80) || "Asia/Karachi",
      };
      appendAudit(database, {
        action: "workspace.updated",
        entityType: "settings",
        entityId: "workspace",
        summary: "Business profile updated.",
      });
      return database;
    });
    return NextResponse.json({ ok: true, state: toPublicState(next) });
  } catch (error) {
    return apiError(error);
  }
}
