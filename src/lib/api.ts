export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string"
      ? payload.error
      : typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}
