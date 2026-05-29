export async function insuranceApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/insurance${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    const hint =
      response.status === 500 || response.status === 502 || response.status === 503
        ? " — is insurance-api running? (pnpm dev includes it, or pnpm dev:insurance)"
        : "";
    throw new Error((body.error ?? `Request failed (${response.status})`) + hint);
  }
  return body;
}
