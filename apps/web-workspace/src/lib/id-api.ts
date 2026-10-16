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
    throw new IdApiError(
      body.error ?? `Request failed (${response.status})`,
      body.code,
      response.status,
    );
  }
  return body;
}
