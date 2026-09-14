import type { ApsEvent } from "@salanor/aegis";

/** OTLP/HTTP JSON logs payload (simplified) for SIEM destinations. */
export function buildOtlpLogsPayload(event: ApsEvent): Record<string, unknown> {
  const emittedMs = Date.parse(event.emitted_at);
  const timeUnixNano = String(
    Number.isFinite(emittedMs) ? emittedMs * 1_000_000 : Date.now() * 1_000_000,
  );

  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "salanor.aegis" } },
            {
              key: "organization.id",
              value: { stringValue: event.organization_id },
            },
            { key: "agent.id", value: { stringValue: event.agent_id } },
            { key: "trace.id", value: { stringValue: event.trace_id } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "salanor.aegis.events" },
            logRecords: [
              {
                timeUnixNano,
                severityNumber: 9,
                severityText: "INFO",
                body: {
                  stringValue: `aegis.${event.action_kind}`,
                },
                attributes: [
                  { key: "event.id", value: { stringValue: event.event_id } },
                  {
                    key: "action.kind",
                    value: { stringValue: event.action_kind },
                  },
                  {
                    key: "policy.decision",
                    value: { stringValue: event.policy_decision },
                  },
                  ...(event.tool_name
                    ? [
                        {
                          key: "tool.name",
                          value: { stringValue: event.tool_name },
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
