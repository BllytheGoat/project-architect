// Thin client-side API wrapper. All calls are same-origin and cookie-
// authenticated. Centralizes error handling into a human-readable shape.
export class ApiClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseError(status: number, res: Response): Promise<string> {
  let msg = `Request failed (${status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error?.message) msg = body.error.message;
  } catch {
    /* keep default */
  }
  return msg;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const message = await parseError(res.status, res);
    throw new ApiClientError(res.status, "unknown", message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
