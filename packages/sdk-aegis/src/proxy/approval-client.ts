export async function requestApprovalViaApi(
  apiBaseUrl: string,
  ingestApiKey: string,
  body: {
    organization_id: string;
    event_id: string;
    trace_id: string;
    tool_name: string;
    deferred: { url: string; method: string };
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ approval_id: string }> {
  const url = new URL("/v1/aegis/approvals/request", apiBaseUrl);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    approval_id?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      `Approval request failed (${res.status}): ${data.error ?? JSON.stringify(data)}`,
    );
  }
  if (!data.approval_id) {
    throw new Error("Missing approval_id in response");
  }
  return { approval_id: data.approval_id };
}

export async function getApprovalStatusViaApi(
  apiBaseUrl: string,
  ingestApiKey: string,
  approvalId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: string; trace_id: string; event_id: string }> {
  const url = new URL(
    `/v1/aegis/approvals/${encodeURIComponent(approvalId)}`,
    apiBaseUrl,
  );
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${ingestApiKey}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    trace_id?: string;
    event_id?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      `Approval status failed (${res.status}): ${data.error ?? JSON.stringify(data)}`,
    );
  }
  return {
    status: data.status!,
    trace_id: data.trace_id!,
    event_id: data.event_id!,
  };
}

export async function completeTraceViaApi(
  apiBaseUrl: string,
  ingestApiKey: string,
  approvalId: string,
  traceId: string,
  organizationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = new URL(
    `/v1/aegis/approvals/${encodeURIComponent(approvalId)}/complete`,
    apiBaseUrl,
  );
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trace_id: traceId, organization_id: organizationId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      `Complete trace failed (${res.status}): ${data.error ?? "unknown"}`,
    );
  }
}
