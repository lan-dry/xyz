/** Classify ingest failures for bus vs direct mode (NATS down → 503 with actionable hint). */
export function ingestErrorResponse(
  err: unknown,
  busEnabled: boolean,
): { status: number; error: string } {
  if (busEnabled && isLikelyBusUnavailable(err)) {
    return {
      status: 503,
      error:
        "Message bus unavailable. Start NATS (`docker compose up -d nats`) or set AEGIS_INGEST_MODE=direct.",
    };
  }

  return { status: 500, error: "Could not accept event." };
}

function isLikelyBusUnavailable(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err && (err as { name: unknown }).name === "NatsError") {
    return true;
  }

  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  return (
    /nats|jetstream/i.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECTION_REFUSED|connection refused/i.test(
      message,
    ) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECTION_REFUSED/i.test(code)
  );
}
