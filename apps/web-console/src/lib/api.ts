/**
 * Aegis console API — browser uses same-origin `/api/console` (Next.js rewrite).
 * Session cookies are set on the console origin; do not call 127.0.0.1:8080 directly.
 */

function consoleApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/console";
  }
  const base =
    process.env.AEGIS_API_URL ??
    process.env.NEXT_PUBLIC_AEGIS_API_URL ??
    "http://127.0.0.1:8080";
  return `${base}/v1/console`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function consoleApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${consoleApiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/** Download a binary export; triggers the browser save dialog (user picks folder). */
export async function consoleDownload(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${consoleApiBase()}${path}`, {
    credentials: "include",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
