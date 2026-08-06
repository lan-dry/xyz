import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

type Creds = { apiBaseUrl: string; apiKey: string };

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

/**
 * Salanor Aegis — community node for n8n.
 * Record Run (end) + Check Policy (before risky steps).
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
      "Record signed Aegis traces and check policies before risky n8n steps",
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
            action: "Record a signed workflow run",
            description:
              "One call: start + pack steps + complete (put at end of workflow)",
          },
          {
            name: "Check Policy",
            value: "checkPolicy",
            action: "Check policy before a risky step",
            description:
              "Call before a side-effect. Deny can stop the branch",
          },
          {
            name: "Start Run",
            value: "startRun",
            action: "Start a workflow trace",
          },
          {
            name: "Complete Run",
            value: "completeRun",
            action: "Complete a workflow trace",
          },
        ],
        default: "recordRun",
      },
      {
        displayName: "Business Context",
        name: "businessContext",
        type: "string",
        default: "={{$workflow.name}}",
        displayOptions: { show: { operation: ["recordRun", "startRun"] } },
      },
      {
        displayName: "Summary",
        name: "summary",
        type: "string",
        default: "n8n workflow completed",
        displayOptions: { show: { operation: ["recordRun", "completeRun"] } },
      },
      {
        displayName: "Nodes JSON",
        name: "nodesJson",
        type: "json",
        default: "[]",
        description:
          "Array of { name, kind: llm|tool|decision|data|result, tool_name?, status?, input_preview?, output_preview? }",
        displayOptions: { show: { operation: ["recordRun", "completeRun"] } },
      },
      {
        displayName: "Trace ID",
        name: "traceId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["completeRun"] } },
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
          { name: "Stop Workflow (error)", value: "error" },
          { name: "Continue With Decision In Output", value: "continue" },
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
        const nodes =
          typeof nodesJson === "string" ? JSON.parse(nodesJson) : nodesJson;
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
              nodes: Array.isArray(nodes) ? nodes : [],
            },
          },
          json: true,
        });

        returnData.push({ json: response as INodeExecutionData["json"] });
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
            payload: items[i].json as Record<string, unknown>,
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
          json: { ...items[i].json, aegis_policy: response },
        });
        continue;
      }

      if (operation === "startRun") {
        const businessContext = this.getNodeParameter(
          "businessContext",
          i,
        ) as string;
        const execId = executionId(this);
        const response = await this.helpers.httpRequest({
          method: "POST",
          url: `${api}/v1/aegis/workflows/runs`,
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            business_context: businessContext,
            external_system: "n8n",
            external_workflow_id: String(this.getWorkflow().id ?? ""),
            external_execution_id: execId,
          },
          json: true,
        });
        returnData.push({ json: response as INodeExecutionData["json"] });
        continue;
      }

      if (operation === "completeRun") {
        const traceId = this.getNodeParameter("traceId", i) as string;
        const summary = this.getNodeParameter("summary", i) as string;
        const nodesJson = this.getNodeParameter("nodesJson", i);
        const nodes =
          typeof nodesJson === "string" ? JSON.parse(nodesJson) : nodesJson;
        const execId = executionId(this);

        const response = await this.helpers.httpRequest({
          method: "POST",
          url: `${api}/v1/aegis/workflows/runs/${encodeURIComponent(traceId)}/complete`,
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            status: "completed",
            summary,
            execution: {
              workflow_name: this.getWorkflow().name,
              execution_id: execId,
              nodes: Array.isArray(nodes) ? nodes : [],
            },
          },
          json: true,
        });
        returnData.push({ json: response as INodeExecutionData["json"] });
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
