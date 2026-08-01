import type {
  ContentChannel,
  ProviderConnectionResult,
  ProviderKind,
} from "@/lib/app-types";

export type ProviderRuntimeSettings = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
};

type GenerateInput = {
  topic: string;
  channel: ContentChannel;
  tone: string;
  objective: string;
  businessName: string;
  businessDescription: string;
};

export type GeneratedContent = {
  title: string;
  body: string;
  hashtags: string[];
  rationale: string;
};

function validateBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Provider URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Provider URL credentials are not allowed. Use the API key field instead.");
  }
  return url.toString().replace(/\/$/, "");
}

function openAiEndpoint(baseUrl: string, resource: "models" | "chat/completions") {
  const normalized = validateBaseUrl(baseUrl);
  return normalized.endsWith("/v1") ? `${normalized}/${resource}` : `${normalized}/v1/${resource}`;
}

function authorizationHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 25_000) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      (payload?.error as { message?: string } | undefined)?.message ||
      (typeof payload?.message === "string" ? payload.message : "") ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

export async function testProvider(settings: ProviderRuntimeSettings): Promise<ProviderConnectionResult> {
  const startedAt = Date.now();
  try {
    if (settings.kind === "ollama") {
      const payload = await fetchJson(`${validateBaseUrl(settings.baseUrl)}/api/tags`);
      const models = Array.isArray(payload?.models)
        ? payload.models
            .map((item) => (item && typeof item === "object" && "name" in item ? String(item.name) : ""))
            .filter(Boolean)
        : [];
      return {
        ok: true,
        message: models.length ? `Ollama connected. ${models.length} local model(s) found.` : "Ollama connected. Pull a model to generate content.",
        models,
        latencyMs: Date.now() - startedAt,
      };
    }

    const payload = await fetchJson(openAiEndpoint(settings.baseUrl, "models"), {
      headers: authorizationHeaders(settings.apiKey),
    });
    const models = Array.isArray(payload?.data)
      ? payload.data
          .map((item) => (item && typeof item === "object" && "id" in item ? String(item.id) : ""))
          .filter(Boolean)
          .slice(0, 50)
      : [];
    return {
      ok: true,
      message: `Provider connected${models.length ? ` with ${models.length} visible model(s)` : ""}.`,
      models,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider connection failed.",
      latencyMs: Date.now() - startedAt,
    };
  }
}

function generationPrompt(input: GenerateInput) {
  return [
    "You are the senior social media copywriter inside a human-approved marketing workflow.",
    "Return only valid JSON with this exact shape:",
    '{"title":"short internal title","body":"publish-ready post","hashtags":["#tag"],"rationale":"one sentence explaining the angle"}',
    "Do not invent statistics, testimonials, customers, awards, prices, or guarantees.",
    "Avoid generic AI phrases, excessive punctuation, and engagement bait.",
    `Business: ${input.businessName || "Not provided"}`,
    `Business context: ${input.businessDescription || "Not provided"}`,
    `Channel: ${input.channel}`,
    `Topic: ${input.topic}`,
    `Objective: ${input.objective || "Build useful awareness"}`,
    `Tone: ${input.tone || "Clear and confident"}`,
    "Adapt length, structure, and hashtag count to the selected channel.",
  ].join("\n");
}

function parseGeneratedContent(value: string): GeneratedContent {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return valid JSON content.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<GeneratedContent>;
  if (typeof parsed.title !== "string" || !parsed.title.trim()) throw new Error("Model response has an invalid title.");
  if (typeof parsed.body !== "string" || !parsed.body.trim()) throw new Error("Model response has an invalid body.");
  if (parsed.hashtags !== undefined && (!Array.isArray(parsed.hashtags) || parsed.hashtags.some((tag) => typeof tag !== "string"))) {
    throw new Error("Model response has invalid hashtags.");
  }
  if (parsed.rationale !== undefined && typeof parsed.rationale !== "string") {
    throw new Error("Model response has an invalid rationale.");
  }
  return {
    title: parsed.title.trim().slice(0, 160),
    body: parsed.body.trim().slice(0, 12_000),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((tag) => tag.trim()).filter(Boolean).slice(0, 20)
      : [],
    rationale: parsed.rationale ? parsed.rationale.trim().slice(0, 500) : "",
  };
}

export async function generateContent(
  settings: ProviderRuntimeSettings,
  input: GenerateInput,
): Promise<GeneratedContent> {
  if (!settings.model) throw new Error("Select a model before generating content.");
  const prompt = generationPrompt(input);

  if (settings.kind === "ollama") {
    const payload = await fetchJson(
      `${validateBaseUrl(settings.baseUrl)}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          format: "json",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.7 },
        }),
      },
      120_000,
    );
    const message = payload?.message as { content?: string } | undefined;
    return parseGeneratedContent(message?.content || "");
  }

  const payload = await fetchJson(
    openAiEndpoint(settings.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizationHeaders(settings.apiKey),
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You create factual, brand-safe marketing drafts for human review." },
          { role: "user", content: prompt },
        ],
      }),
    },
    120_000,
  );
  const choices = payload?.choices as Array<{ message?: { content?: string } }> | undefined;
  return parseGeneratedContent(choices?.[0]?.message?.content || "");
}
