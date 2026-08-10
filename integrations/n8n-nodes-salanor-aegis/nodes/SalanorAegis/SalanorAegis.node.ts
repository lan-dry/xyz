import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

type Creds = { apiBaseUrl: string; apiKey: string };

type CaptureNode = {
  name: string;
  kind: "llm" | "tool" | "decision" | "data" | "result";
  tool_name?: string;
  status?: string;
  purpose?: string;
  input_preview?: string;
  output_preview?: string;
};

type PolicyEvaluateResponse = {
  decision?: string;
  reason?: string;
  rule_id?: string | null;
  policy_id?: string;
  engine?: string;
  trace_id?: string;
  trace_url?: string;
  approval_id?: string;
  approval_url?: string;
  recorded?: boolean;
};

type PolicyGatePayload = {
  tool_name: string;
  decision: string;
  policy_id: string;
  rule_id: string | null;
  reason: string;
  engine?: string;
};

function baseUrl(creds: Creds): string {
  return (creds.apiBaseUrl || "https://api.salanor.com").replace(/\/+$/, "");
}

function executionId(ctx: IExecuteFunctions): string {
  try {
    const id = (ctx as IExecuteFunctions & { getExecutionId?: () => string })
      .getExecutionId?.();
    return id ? String(id) : "";
  } catch {
    return "";
  }
}

function preview(value: unknown, max = 400): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value ?? {});
    return s.length <= max ? s : `${s.slice(0, max)}…`;
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function policyGateFromEval(
  toolName: string,
  response: PolicyEvaluateResponse,
): PolicyGatePayload | undefined {
  if (
    response.decision === "allow" &&
    response.policy_id &&
    response.recorded !== true
  ) {
    return {
      tool_name: toolName,
      decision: "allow",
      policy_id: response.policy_id,
      rule_id: response.rule_id ?? null,
      reason: response.reason ?? "allowed",
      engine: response.engine,
    };
  }
  return undefined;
}

async function pollApproval(
  ctx: IExecuteFunctions,
  creds: Creds,
  approvalId: string,
  maxWaitMs: number,
  intervalMs: number,
): Promise<{ status: string; trace_id?: string }> {
  const api = baseUrl(creds);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const status = (await ctx.helpers.httpRequest({
      method: "GET",
      url: `${api}/v1/aegis/approvals/${encodeURIComponent(approvalId)}`,
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      json: true,
    })) as { status?: string; trace_id?: string };
    if (
      status.status === "approved" ||
      status.status === "rejected" ||
      status.status === "expired"
    ) {
      return {
        status: status.status ?? "pending",
        trace_id: status.trace_id,
      };
    }
    await sleep(intervalMs);
  }
  throw new NodeOperationError(
    ctx.getNode(),
    `Aegis approval ${approvalId} timed out after ${Math.round(maxWaitMs / 1000)}s`,
  );
}

/** Build signed step list from explicit JSON or from the incoming item. */
function resolveCaptureNodes(
  nodesJson: unknown,
  item: INodeExecutionData,
): CaptureNode[] {
  let parsed: unknown = nodesJson;
  if (typeof nodesJson === "string" && nodesJson.trim()) {
    try {
      parsed = JSON.parse(nodesJson);
    } catch {
      parsed = [];
    }
  }
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed as CaptureNode[];
  }

  const j = (item.json ?? {}) as IDataObject;
  const nodes: CaptureNode[] = [];

  const llm = j.sample_llm ?? j.llm ?? j.openai;
  if (llm != null) {
    nodes.push({
      name: "LLM",
      kind: "llm",
      purpose: "LLM step",
      output_preview: preview(llm),
    });
  }

  const tool = j.sample_tool ?? j.tool;
  if (tool != null && typeof tool === "object") {
    const t = tool as IDataObject;
    nodes.push({
      name: String(t.name ?? t.action ?? "Tool"),
      kind: "tool",
      tool_name: String(t.tool_name ?? t.action ?? "orchestrator.tool"),
      status: String(t.status ?? "success"),
      output_preview: preview(tool),
    });
  }

  const err =
    j.error ?? j.executionError ?? j.message ?? j.errorMessage ?? null;
  if (nodes.length === 0 && err != null) {
    nodes.push({
      name: "Workflow error",
      kind: "result",
      purpose: "Captured failed execution",
      status: "failed",
      output_preview: preview(err),
    });
    return nodes;
  }

  if (nodes.length === 0) {
    nodes.push({
      name: "Workflow result",
      kind: "result",
      purpose: "Captured final workflow item",
      output_preview: preview(j),
    });
  }

  return nodes;
}

/**
 * Salanor Aegis for n8n.
 *
 * - Check Policy: before risky tools (deny/obligation write gate traces; allow folds into Record Run)
 * - Record Run: once at end (or on Error Trigger with status=failed)
 */
export class SalanorAegis implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Salanor Aegis",
    name: "salanorAegis",
    icon: "file:salanor.png",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description:
      "Check policy before risky steps and record signed workflow traces",
    defaults: { name: "Salanor Aegis" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "salanorAegisApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Check Policy",
            value: "checkPolicy",
            action: "Check policy before risky step",
            description:
              "Before payments/deletes/sends. Deny stops the workflow. Allow is folded into Record Run (one trace per run).",
          },
          {
            name: "Record Run",
            value: "recordRun",
            action: "Record signed workflow run",
            description:
              "Once at the end of a successful path, or on Error Trigger with status Failed.",
          },
        ],
        default: "checkPolicy",
      },
      {
        displayName: "Organization ID",
        name: "organizationId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["checkPolicy"] } },
      },
      {
        displayName: "Agent ID",
        name: "agentId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["checkPolicy"] } },
      },
      {
        displayName: "Tool Name",
        name: "toolName",
        type: "string",
        default: "",
        required: true,
        placeholder: "app.payments.transfer",
        description:
          "Same string as the tool pattern in Console → Policies (e.g. app.payments.transfer).",
        displayOptions: { show: { operation: ["checkPolicy"] } },
      },
      {
        displayName: "On Deny",
        name: "onDeny",
        type: "options",
        options: [
          { name: "Stop Workflow", value: "error" },
          { name: "Continue (attach decision)", value: "continue" },
        ],
        default: "error",
        displayOptions: { show: { operation: ["checkPolicy"] } },
      },
      {
        displayName: "Wait For Approval",
        name: "waitForApproval",
        type: "boolean",
        default: true,
        description:
          "When policy requires human approval, pause and poll until approved or rejected",
        displayOptions: { show: { operation: ["checkPolicy"] } },
      },
      {
        displayName: "Approval Poll Interval (Seconds)",
        name: "approvalPollSeconds",
        type: "number",
        default: 5,
        displayOptions: {
          show: { operation: ["checkPolicy"], waitForApproval: [true] },
        },
      },
      {
        displayName: "Approval Timeout (Seconds)",
        name: "approvalTimeoutSeconds",
        type: "number",
        default: 300,
        displayOptions: {
          show: { operation: ["checkPolicy"], waitForApproval: [true] },
        },
      },
      {
        displayName: "Business Context",
        name: "businessContext",
        type: "string",
        default: "={{$workflow.name}}",
        displayOptions: { show: { operation: ["recordRun"] } },
      },
      {
        displayName: "Summary",
        name: "summary",
        type: "string",
        default: "Workflow completed",
        displayOptions: { show: { operation: ["recordRun"] } },
      },
      {
        displayName: "Run Status",
        name: "runStatus",
        type: "options",
        options: [
          { name: "Completed", value: "completed" },
          { name: "Failed", value: "failed" },
        ],
        default: "completed",
        description:
          "Use Failed when this node sits on an Error Trigger path so crashes still leave a signed trace.",
        displayOptions: { show: { operation: ["recordRun"] } },
      },
      {
        displayName: "Steps (optional)",
        name: "nodesJson",
        type: "json",
        default: "[]",
        description:
          "Optional explicit steps. Leave [] to auto-capture the incoming item (and sample_llm / sample_tool / error if present).",
        displayOptions: { show: { operation: ["recordRun"] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const creds = (await this.getCredentials("salanorAegisApi")) as Creds;
    const api = baseUrl(creds);
    const operation = this.getNodeParameter("operation", 0) as string;

    for (let i = 0; i < items.length; i++) {
      if (operation === "recordRun") {
        const businessContext = this.getNodeParameter(
          "businessContext",
          i,
        ) as string;
        const summary = this.getNodeParameter("summary", i) as string;
        const runStatus = this.getNodeParameter("runStatus", i) as
          | "completed"
          | "failed";
        const nodesJson = this.getNodeParameter("nodesJson", i);
        const nodes = resolveCaptureNodes(nodesJson, items[i]);
        const execId = executionId(this);

        const itemJson = (items[i].json ?? {}) as IDataObject;
        const aegis = itemJson.aegis_policy as PolicyEvaluateResponse | undefined;
        const toolName = String(itemJson.aegis_tool ?? "");
        const resumeTraceId =
          aegis?.trace_id &&
          (aegis.decision === "allow_with_obligation" || aegis.recorded === true)
            ? aegis.trace_id
            : undefined;
        const policyGate = resumeTraceId
          ? undefined
          : policyGateFromEval(toolName, aegis ?? {});

        const runBody: IDataObject = {
          business_context: businessContext,
          external_system: "n8n",
          external_workflow_id: String(this.getWorkflow().id ?? ""),
          external_execution_id: execId,
          status: runStatus,
          summary:
            runStatus === "failed" && summary === "Workflow completed"
              ? "Workflow failed"
              : summary,
          execution: {
            workflow_name: this.getWorkflow().name,
            execution_id: execId,
            nodes,
          },
        };
        if (policyGate) {
          runBody.policy_gate = policyGate;
        }

        const response = resumeTraceId
          ? await this.helpers.httpRequest({
              method: "POST",
              url: `${api}/v1/aegis/workflows/runs/${encodeURIComponent(resumeTraceId)}/complete`,
              headers: {
                Authorization: `Bearer ${creds.apiKey}`,
                "Content-Type": "application/json",
              },
              body: runBody,
              json: true,
            })
          : await this.helpers.httpRequest({
              method: "POST",
              url: `${api}/v1/aegis/workflows/runs`,
              headers: {
                Authorization: `Bearer ${creds.apiKey}`,
                "Content-Type": "application/json",
              },
              body: { one_shot: true, ...runBody },
              json: true,
            });

        returnData.push({ json: response as IDataObject });
        continue;
      }

      if (operation === "checkPolicy") {
        const organizationId = this.getNodeParameter(
          "organizationId",
          i,
        ) as string;
        const agentId = this.getNodeParameter("agentId", i) as string;
        const toolName = this.getNodeParameter("toolName", i) as string;
        const onDeny = this.getNodeParameter("onDeny", i) as string;
        const waitForApproval = this.getNodeParameter(
          "waitForApproval",
          i,
        ) as boolean;
        const approvalPollSeconds = this.getNodeParameter(
          "approvalPollSeconds",
          i,
        ) as number;
        const approvalTimeoutSeconds = this.getNodeParameter(
          "approvalTimeoutSeconds",
          i,
        ) as number;
        const execId = executionId(this);

        const response = (await this.helpers.httpRequest({
          method: "POST",
          url: `${api}/v1/aegis/policy/evaluate`,
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            organization_id: organizationId,
            agent_id: agentId,
            tool_name: toolName,
            payload: items[i].json as IDataObject,
            external_system: "n8n",
            external_workflow_id: String(this.getWorkflow().id ?? ""),
            external_execution_id: execId,
          },
          json: true,
        })) as PolicyEvaluateResponse;

        if (response.decision === "deny" && onDeny === "error") {
          const where = response.trace_url
            ? ` Audit: ${response.trace_url}`
            : response.trace_id
              ? ` Trace: ${response.trace_id}`
              : "";
          throw new NodeOperationError(
            this.getNode(),
            `Aegis policy denied "${toolName}": ${response.reason ?? "denied"}.${where}`,
            { itemIndex: i },
          );
        }

        if (
          response.decision === "allow_with_obligation" &&
          response.approval_id
        ) {
          if (!waitForApproval) {
            returnData.push({
              json: {
                ...(items[i].json as IDataObject),
                aegis_policy: response,
                aegis_tool: toolName,
              },
            });
            continue;
          }

          const decision = await pollApproval(
            this,
            creds,
            response.approval_id,
            Math.max(approvalTimeoutSeconds, 5) * 1000,
            Math.max(approvalPollSeconds, 2) * 1000,
          );

          if (decision.status === "rejected" || decision.status === "expired") {
            const traceId = decision.trace_id ?? response.trace_id;
            if (traceId) {
              await this.helpers.httpRequest({
                method: "POST",
                url: `${api}/v1/aegis/workflows/runs/${encodeURIComponent(traceId)}/complete`,
                headers: {
                  Authorization: `Bearer ${creds.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: {
                  status: "failed",
                  summary:
                    decision.status === "expired"
                      ? `Approval expired for ${toolName}`
                      : `Approval rejected for ${toolName}`,
                },
                json: true,
              }).catch(() => undefined);
            }
            const where = response.approval_url
              ? ` Approval: ${response.approval_url}`
              : response.trace_url
                ? ` Audit: ${response.trace_url}`
                : "";
            throw new NodeOperationError(
              this.getNode(),
              decision.status === "expired"
                ? `Aegis approval expired for "${toolName}" (24h limit).${where}`
                : `Aegis approval rejected for "${toolName}".${where}`,
              { itemIndex: i },
            );
          }

          returnData.push({
            json: {
              ...(items[i].json as IDataObject),
              aegis_policy: {
                ...response,
                trace_id: decision.trace_id ?? response.trace_id,
                approval_status: "approved",
              },
              aegis_tool: toolName,
            },
          });
          continue;
        }

        returnData.push({
          json: {
            ...(items[i].json as IDataObject),
            aegis_policy: response,
            aegis_tool: toolName,
          },
        });
        continue;
      }

      throw new NodeOperationError(
        this.getNode(),
        `Unknown operation: ${operation}`,
        { itemIndex: i },
      );
    }

    return [returnData];
  }
}
