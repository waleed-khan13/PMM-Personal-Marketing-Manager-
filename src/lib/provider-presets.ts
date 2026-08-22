import type { ProviderKind } from "@/lib/app-types";

export type ProviderPreset = {
  kind: ProviderKind;
  label: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyRequired: boolean;
  keyPlaceholder: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: "ollama",
    label: "Local AI (Ollama)",
    description: "Runs privately on this computer. Socium finds your installed models automatically.",
    baseUrl: "http://127.0.0.1:11434",
    defaultModel: "",
    apiKeyRequired: false,
    keyPlaceholder: "",
  },
  {
    kind: "openai",
    label: "OpenAI",
    description: "A ready-to-use OpenAI connection with a cost-conscious default model.",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-luna",
    apiKeyRequired: true,
    keyPlaceholder: "sk-…",
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    description: "Uses Gemini's official OpenAI-compatible API.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.7-flash",
    apiKeyRequired: true,
    keyPlaceholder: "AIza…",
  },
  {
    kind: "anthropic",
    label: "Claude (Anthropic)",
    description: "Uses Anthropic's native Messages API and Claude Sonnet by default.",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    apiKeyRequired: true,
    keyPlaceholder: "sk-ant-…",
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    description: "Starts with OpenRouter's free model router; choose another model any time.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    apiKeyRequired: true,
    keyPlaceholder: "sk-or-v1-…",
  },
  {
    kind: "nvidia",
    label: "NVIDIA NIM",
    description: "Connects to NVIDIA's hosted NIM chat API.",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.1-8b-instruct",
    apiKeyRequired: true,
    keyPlaceholder: "nvapi-…",
  },
  {
    kind: "openai-compatible",
    label: "Custom OpenAI-compatible",
    description: "Advanced option for LM Studio, LocalAI, or another compatible endpoint.",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "",
    apiKeyRequired: false,
    keyPlaceholder: "Optional API key",
  },
];

export function getProviderPreset(kind: ProviderKind): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.kind === kind) ?? PROVIDER_PRESETS[0];
}
