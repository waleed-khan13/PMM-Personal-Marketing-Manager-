import { NextResponse } from "next/server";

export function apiError(error: unknown, fallback = "Request failed.", status = 400) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function cleanText(value: unknown, maxLength: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error("A required field is missing.");
  return text.slice(0, maxLength);
}

export function cleanUrl(value: unknown) {
  const text = cleanText(value, 500, true);
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("URL must use http or https.");
  if (url.username || url.password) throw new Error("URL credentials are not allowed. Use the API key field instead.");
  return url.toString().replace(/\/$/, "");
}
