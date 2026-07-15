/** Salanor ID — platform auth (same-origin proxy to services/id). */

export class IdApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "IdApiError";
  }
}

export async function idApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/id${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    const hint =
      response.status === 500 && !body.error
        ? "Salanor ID returned an error. Is `services/id` running on port 8091 with Postgres up?"
        : (body.error ?? `Request failed (${response.status})`);
    throw new IdApiError(hint, body.code, response.status);
  }
  return body;
}
