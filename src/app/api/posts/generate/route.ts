import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { ContentChannel, GeneratedPost } from "@/lib/app-types";
import { apiError, cleanText } from "@/server/http";
import { generateContent } from "@/server/provider";
import {
  appendAudit,
  decryptSecret,
  readDatabase,
  toPublicState,
  updateDatabase,
} from "@/server/store";
import { sendApprovalRequest } from "@/server/telegram";

const supportedChannels: ContentChannel[] = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "telegram",
  "blog",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const channel = body.channel as ContentChannel;
    if (!supportedChannels.includes(channel)) throw new Error("Select a supported channel.");

    const topic = cleanText(body.topic, 1_000, true);
    const tone = cleanText(body.tone, 160) || "Clear and confident";
    const objective = cleanText(body.objective, 500) || "Build useful awareness";
    const notifyTelegram = body.notifyTelegram === true;
    const database = await readDatabase();

    if (!database.provider.baseUrl || !database.provider.model) {
      throw new Error("Connect an AI provider and select a model first.");
    }

    const apiKey = await decryptSecret(database.provider.apiKey);
    const generated = await generateContent(
      {
        kind: database.provider.kind,
        baseUrl: database.provider.baseUrl,
        model: database.provider.model,
        apiKey,
      },
      {
        topic,
        channel,
        tone,
        objective,
        businessName: database.workspace.businessName,
        businessDescription: database.workspace.description,
      },
    );

    const now = new Date().toISOString();
    const post: GeneratedPost = {
      id: randomUUID(),
      revision: 1,
      topic,
      channel,
      tone,
      objective,
      title: generated.title,
      body: generated.body,
      hashtags: generated.hashtags,
      rationale: generated.rationale,
      status: "pending",
      providerKind: database.provider.kind,
      model: database.provider.model,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      publishedAt: null,
      remoteId: null,
      lastError: null,
    };

    let next = await updateDatabase((current) => {
      current.posts.unshift(post);
      appendAudit(current, {
        action: "post.generated",
        entityType: "post",
        entityId: post.id,
        summary: `${channel} draft generated with ${post.model}.`,
      });
      return current;
    });

    let notification: { ok: boolean; message: string } | null = null;
    if (notifyTelegram) {
      try {
        const token = await decryptSecret(next.telegram.botToken);
        if (!token || !next.telegram.chatId) throw new Error("Telegram approval is not configured.");
        await sendApprovalRequest(token, next.telegram.chatId, post);
        notification = { ok: true, message: "Approval request sent to Telegram." };
        next = await updateDatabase((current) => {
          appendAudit(current, {
            action: "approval.sent",
            entityType: "post",
            entityId: post.id,
            summary: "Approval request sent to Telegram.",
          });
          return current;
        });
      } catch (error) {
        notification = {
          ok: false,
          message: error instanceof Error ? error.message : "Telegram notification failed.",
        };
      }
    }

    return NextResponse.json({ ok: true, post, notification, state: toPublicState(next) });
  } catch (error) {
    return apiError(error, "Content generation failed.", 502);
  }
}
