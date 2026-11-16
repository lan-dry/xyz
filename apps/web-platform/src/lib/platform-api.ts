/** Platform Ops API: authenticated via platform_staff session cookie (not bootstrap secret). */
export async function platformApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const res = await fetch(`/api/platform/${normalized}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data: (T & { error?: string }) | null = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new Error(
        res.ok
          ? "Identity service returned a non-JSON response."
          : `Request failed (${res.status}).`,
      );
    }
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  if (data === null) {
    throw new Error("Identity service returned an empty response.");
  }
  return data;
}
