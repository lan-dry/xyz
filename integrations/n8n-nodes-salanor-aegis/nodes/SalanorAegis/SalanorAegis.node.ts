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
 * Salanor Aegis — official community node for n8n.
 *
 * Customer install: Settings → Community Nodes → n8n-nodes-salanor-aegis
 *
 * - Record Run: one node at end of workflow → full signed APS-1 trace
 * - Check Policy: before risky tools → deny can stop the branch
 */
export class SalanorAegis implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Salanor Aegis",
    name: "salanorAegis",
    icon: "file:salanor.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description:
      "Governance for agent workflows: record signed traces and enforce policies",
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
            name: "Record Run",
            value: "recordRun",
            action: "Record signed workflow run",
            description:
              "Place once at the end. Signs the full run (one API call).",
          },
          {
            name: "Check Policy",
            value: "checkPolicy",
            action: "Check policy before risky step",
            description:
              "Place before payments/deletes/sends. Deny stops the workflow.",
          },
        ],
        default: "recordRun",
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
        displayName: "Steps (optional)",
        name: "nodesJson",
        type: "json",
        default: "[]",
        description:
          "Optional explicit steps. Leave [] to auto-capture the incoming item as the signed result (and sample_llm / sample_tool if present).",
        displayOptions: { show: { operation: ["recordRun"] } },
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
        const nodesJson = this.getNodeParameter("nodesJson", i);
        const nodes = resolveCaptureNodes(nodesJson, items[i]);
        const execId = executionId(this);

        const response = await this.helpers.httpRequest({
          method: "POST",
          url: `${api}/v1/aegis/workflows/runs`,
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            one_shot: true,
            business_context: businessContext,
            external_system: "n8n",
            external_workflow_id: String(this.getWorkflow().id ?? ""),
            external_execution_id: execId,
            status: "completed",
            summary,
            execution: {
              workflow_name: this.getWorkflow().name,
              execution_id: execId,
              nodes,
            },
          },
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
          },
          json: true,
        })) as { decision?: string; reason?: string };

        if (response.decision === "deny" && onDeny === "error") {
          throw new NodeOperationError(
            this.getNode(),
            `Aegis policy denied "${toolName}": ${response.reason ?? "denied"}`,
            { itemIndex: i },
          );
        }

        returnData.push({
          json: { ...(items[i].json as IDataObject), aegis_policy: response },
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
