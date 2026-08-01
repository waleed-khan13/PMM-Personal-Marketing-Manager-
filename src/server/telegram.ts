type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function telegramRequest<T>(token: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram returned ${response.status}.`);
  }
  return payload.result as T;
}

export async function testTelegramConnection(token: string) {
  const bot = await telegramRequest<{ id: number; username?: string; first_name: string }>(token, "getMe");
  return {
    id: bot.id,
    name: bot.username ? `@${bot.username}` : bot.first_name,
  };
}

export async function sendApprovalRequest(
  token: string,
  chatId: string,
  post: { id: string; revision: number; title: string; body: string; hashtags: string[]; channel: string },
) {
  const hashtagLine = post.hashtags.length ? `\n\n${post.hashtags.join(" ")}` : "";
  const preview = `${post.body}${hashtagLine}`.slice(0, 3000);
  return telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: `Approval requested · ${post.channel} · revision ${post.revision}\n\n${post.title}\n\n${preview}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `lg:approve:${post.id}:${post.revision}` },
          { text: "Reject", callback_data: `lg:reject:${post.id}:${post.revision}` },
        ],
      ],
    },
  });
}

export async function publishTelegramPost(
  token: string,
  chatId: string,
  post: { body: string; hashtags: string[] },
) {
  const hashtagLine = post.hashtags.length ? `\n\n${post.hashtags.join(" ")}` : "";
  const text = `${post.body}${hashtagLine}`.slice(0, 4096);
  return telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function answerTelegramCallback(token: string, callbackQueryId: string, text: string) {
  return telegramRequest<boolean>(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function configureTelegramWebhook(token: string, url: string, secretToken: string) {
  return telegramRequest<boolean>(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
  });
}
