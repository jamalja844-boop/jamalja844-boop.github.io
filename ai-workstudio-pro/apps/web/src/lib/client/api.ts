"use client";

export class ClientApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown> | null) {
    super(message);
  }
  get setup(): { provider: string; where: string } | null {
    return (this.details?.setup as { provider: string; where: string }) ?? null;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const d = data as { error?: string; details?: Record<string, unknown> } | null;
    // Verlopen sessie → naar inloggen (maar niet bij het inloggen zelf, dan tonen we de foutmelding).
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) window.location.href = "/login";
    throw new ClientApiError(res.status, d?.error ?? `Fout ${res.status}`, d?.details ?? null);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
};

/** Leest een NDJSON-stream (één JSON-object per regel). */
export async function readNdjson(res: Response, onEvent: (e: Record<string, unknown>) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
