function looksLikeHtml(body: string): boolean {
  const sample = body.trim().slice(0, 512).toLowerCase();
  return (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    (sample.includes("<head") && sample.includes("<body"))
  );
}

export function formatApiError(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "Something went wrong. Try again.";
  }
  if (looksLikeHtml(trimmed)) {
    return "Couldn't reach the service. Check the address.";
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string | { message?: string };
      message?: string;
      detail?: string;
    };
    if (typeof parsed.error === "string") {
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return `${parsed.error}: ${parsed.detail}`;
      }
      return parsed.error;
    }
    if (parsed.error && typeof parsed.error.message === "string") {
      return parsed.error.message;
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    /* not JSON */
  }
  if (/^internal server error$/i.test(trimmed)) {
    return "Something went wrong. Try again.";
  }
  return trimmed.length > 320 ? `${trimmed.slice(0, 320)}…` : trimmed;
}
