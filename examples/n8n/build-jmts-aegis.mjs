/**
 * Build JMT-S + Aegis n8n workflows from the base content-sync JSON.
 *
 * Outputs:
 *   jmt-s-content-sync-with-aegis.json          — governed (default): policy gate before publish
 *   jmt-s-content-sync-with-aegis-audit.json    — dry-run + Aegis capture only (no live publish)
 *
 * Usage:
 *   node build-jmts-aegis.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const integrationBase = path.resolve(
  here,
  "../../integrations/n8n-nodes-salanor-aegis/examples/jmt-s-content-sync.json",
);
const integrationOut = path.resolve(
  here,
  "../../integrations/n8n-nodes-salanor-aegis/examples",
);
const examplesOut = here;

function loadBase() {
  const src = fs.existsSync(path.join(here, "jmt-s-content-sync.json"))
    ? path.join(here, "jmt-s-content-sync.json")
    : integrationBase;
  return JSON.parse(fs.readFileSync(src, "utf8"));
}

function stripAutoPublishFromConfig(wf) {
  const config = wf.nodes.find((n) => n.name === "0. Config");
  if (!config) return;
  config.parameters.jsCode = config.parameters.jsCode
    .replace(
      /\nconst autoPublish = String\(\$env\.JMTS_AUTO_PUBLISH[^\n]+\n/,
      "\n",
    )
    .replace(/, autoPublish, openAiModel/g, ", openAiModel")
    .replace(/autoPublish, /g, "");
}

function patchSummaryNode(wf, { governed }) {
  const summary = wf.nodes.find((n) => n.name === "9. Summary");
  if (!summary) return;

  summary.parameters.jsCode = `const config = $('0. Config').first().json;
const agg = $('2h. Aggregate extracted content').first().json;

if (agg?.noUsableContent) {
  return [{
    json: {
      status: 'EXTRACTION_FAILED',
      instructionSummary: agg.extractionNote || 'No usable text extracted from Drive files.',
      updateCount: 0,
      filteredOnServer: 0,
      driveFilesRead: agg.sourceItemCount ?? 0,
      skipped: agg.skipped ?? [],
      extractErrors: agg.extractErrors ?? [],
      skippedFilenames: agg.skippedFilenames ?? [],
      note: agg.extractionNote ?? null,
      baseUrl: config.baseUrl,
    },
  }];
}

const parsed = $('5. Parse AI diff').first().json;

let dryRun = null;
let published = null;
let policy = null;
try { dryRun = $('6. JMT-S Apply dry-run').first().json; } catch {}
try { published = $('8. JMT-S Apply publish').first().json; } catch {}
try { policy = $('7b. Check Policy (publish)').first().json; } catch {}

const updates = parsed.updates ?? parsed.applyDryRun?.updates ?? [];
const updateCount = updates.length;
const allFilteredOnServer = Boolean(dryRun?.filteredCount && !(dryRun?.results?.length));

let status = 'FAILED';
if (parsed.skipApply || allFilteredOnServer) {
  status = 'NO_CHANGES';
} else if (published?.status === 'success') {
  status = 'PUBLISHED';
} else if (dryRun?.status === 'success') {
  status = 'DRY_RUN_OK';
} else {
  status = 'FAILED';
}

return [{
  json: {
    status,
    instructionSummary: parsed.instructionSummary,
    updateCount,
    filteredOnServer: dryRun?.filteredCount ?? 0,
    updatesPreview: updates.slice(0, 5).map((u) => ({
      resource: u.resource,
      action: u.action,
      id: u.id,
      title: u.data?.title ?? u.patch?.title ?? null,
    })),
    driveFilesRead: agg?.fileCount ?? null,
    dryRunStatus: dryRun?.status ?? null,
    dryRunRunId: dryRun?.runId ?? null,
    dryRunMessage: dryRun?.message ?? null,
    publishStatus: published?.status ?? null,
    publishRunId: published?.runId ?? null,
    policyDecision: policy?.decision ?? null,
    policyApprovalId: policy?.approval_id ?? null,
    note: parsed.note ?? dryRun?.message ?? null,
    baseUrl: config.baseUrl,
  },
}];`;
}

function removeAutoPublishGate(wf) {
  wf.nodes = wf.nodes.filter((n) => n.name !== "7. Auto-publish?");
  delete wf.connections["7. Auto-publish?"];
}

function addPublishGateNodes(wf) {
  wf.nodes.push(
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "dry-ok",
              leftValue: "={{ $('6. JMT-S Apply dry-run').first().json.status }}",
              rightValue: "success",
              operator: { type: "string", operation: "equals" },
            },
            {
              id: "has-results",
              leftValue:
                "={{ ($('6. JMT-S Apply dry-run').first().json.results || []).length }}",
              rightValue: 0,
              operator: { type: "number", operation: "gt" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: "sync-gov-0070",
      name: "7. Publishable updates?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2860, 400],
    },
    {
      parameters: {
        mode: "manual",
        duplicateItem: false,
        assignments: {
          assignments: [
            {
              id: "summary",
              name: "summary",
              value:
                "={{ $('5. Parse AI diff').first().json.instructionSummary || 'CMS publish after Drive sync' }}",
              type: "string",
            },
            {
              id: "update_count",
              name: "update_count",
              value:
                "={{ ($('6. JMT-S Apply dry-run').first().json.results || []).length }}",
              type: "number",
            },
            {
              id: "recipient",
              name: "recipient",
              value: "CMS live site (JMT-S)",
              type: "string",
            },
          ],
        },
        options: {},
      },
      id: "sync-gov-0075",
      name: "7a. Publish context",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [3080, 300],
    },
    {
      parameters: {
        operation: "checkPolicy",
        organizationId: "YOUR_ORG_ID",
        agentId: "YOUR_AGENT_ID",
        toolName: "jmts.content.publish",
        onDeny: "error",
        waitForApproval: true,
        approvalPollSeconds: 5,
        approvalTimeoutSeconds: 86400,
      },
      id: "sync-gov-007b",
      name: "7b. Check Policy (publish)",
      type: "n8n-nodes-salanor-aegis.salanorAegis",
      typeVersion: 1,
      position: [3300, 300],
      credentials: {
        salanorAegisApi: {
          id: "CONFIGURE_SALANOR_AEGIS",
          name: "Salanor Aegis API",
        },
      },
    },
  );

  wf.connections["6b. Check dry-run"] = {
    main: [[{ node: "7. Publishable updates?", type: "main", index: 0 }]],
  };
  wf.connections["7. Publishable updates?"] = {
    main: [
      [{ node: "7a. Publish context", type: "main", index: 0 }],
      [{ node: "9. Summary", type: "main", index: 0 }],
    ],
  };
  wf.connections["7a. Publish context"] = {
    main: [[{ node: "7b. Check Policy (publish)", type: "main", index: 0 }]],
  };
  wf.connections["7b. Check Policy (publish)"] = {
    main: [[{ node: "8. JMT-S Apply publish", type: "main", index: 0 }]],
  };
}

function stripPublishPath(wf) {
  wf.nodes = wf.nodes.filter((n) => n.name !== "8. JMT-S Apply publish");
  delete wf.connections["8. JMT-S Apply publish"];
  wf.connections["6b. Check dry-run"] = {
    main: [[{ node: "9. Summary", type: "main", index: 0 }]],
  };
}

function addAegisCapture(wf, { includePolicyStep }) {
  const prepareCode = String.raw`/**
 * Build one-shot Workflow Bridge payload from JMT-S summary + captured steps.
 */
const summary = $('9. Summary').first().json;

function safeJson(nodeName, max = 400) {
  try {
    return JSON.stringify($(nodeName).first().json).slice(0, max);
  } catch {
    return '';
  }
}

function safeSlice(nodeName, path, max = 400) {
  try {
    const j = $(nodeName).first().json;
    const parts = path.split('.');
    let v = j;
    for (const p of parts) v = v?.[p];
    return String(v ?? '').slice(0, max);
  } catch {
    return '';
  }
}

const nodes = [];

nodes.push({
  name: '4. OpenAI diff',
  kind: 'llm',
  purpose: 'Propose CMS updates from Drive documents and site snapshot',
  input_preview: safeSlice('3. Prepare OpenAI', 'messages.1.content'),
  output_preview: safeSlice('4. OpenAI diff', 'choices.0.message.content'),
});

try {
  $('6. JMT-S Apply dry-run').first();
  nodes.push({
    name: '6. JMT-S Apply dry-run',
    kind: 'tool',
    tool_name: 'jmts.content.apply',
    status: summary.dryRunStatus === 'success' ? 'success' : 'skipped',
    output_preview: safeJson('6. JMT-S Apply dry-run'),
  });
} catch {}
`;

  const policyBlock = includePolicyStep
    ? String.raw`
try {
  $('7b. Check Policy (publish)').first();
  nodes.push({
    name: '7b. Check Policy (publish)',
    kind: 'decision',
    purpose: 'Human approval before live CMS publish',
    output_preview: safeJson('7b. Check Policy (publish)'),
  });
} catch {}
`
    : "";

  const publishBlock = String.raw`
try {
  $('8. JMT-S Apply publish').first();
  nodes.push({
    name: '8. JMT-S Apply publish',
    kind: 'tool',
    tool_name: 'jmts.content.publish',
    status: summary.publishStatus === 'success' ? 'success' : 'skipped',
    output_preview: safeJson('8. JMT-S Apply publish'),
  });
} catch {}
`;

  const tail = includePolicyStep
    ? String.raw`
const runStatus =
  summary.status === 'FAILED' || summary.status === 'EXTRACTION_FAILED'
    ? 'failed'
    : 'completed';

let obligationTraceId = null;
try {
  const policyRow = $('7b. Check Policy (publish)').first().json;
  obligationTraceId =
    policyRow?.aegis_policy?.trace_id ??
    policyRow?.trace_id ??
    null;
} catch {}

const aegisBody = {
  business_context: 'JMT-S daily content sync from Google Drive',
  external_system: 'n8n',
  external_workflow_id: String($workflow.id),
  external_execution_id: String($execution.id),
  status: runStatus,
  summary:
    summary.status +
    (summary.updateCount != null ? ': ' + summary.updateCount + ' update(s)' : ''),
  execution: {
    workflow_name: $workflow.name,
    execution_id: String($execution.id),
    nodes,
  },
};

if (!obligationTraceId) {
  aegisBody.one_shot = true;
}

return [{
  json: {
    obligationTraceId,
    aegisBody,
  },
}];`
    : String.raw`
const runStatus =
  summary.status === 'FAILED' || summary.status === 'EXTRACTION_FAILED'
    ? 'failed'
    : 'completed';

return [{
  json: {
    obligationTraceId: null,
    aegisBody: {
      one_shot: true,
      business_context: 'JMT-S daily content sync from Google Drive',
      external_system: 'n8n',
      external_workflow_id: String($workflow.id),
      external_execution_id: String($execution.id),
      status: runStatus,
      summary:
        summary.status +
        (summary.updateCount != null ? ': ' + summary.updateCount + ' update(s)' : ''),
      execution: {
        workflow_name: $workflow.name,
        execution_id: String($execution.id),
        nodes,
      },
    },
  },
}];`;

  const fullPrepare = prepareCode + policyBlock + publishBlock + tail;

  wf.nodes.push(
    {
      parameters: { jsCode: fullPrepare },
      id: "sync-aegis-0010",
      name: "10. Prepare Aegis capture",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3520, 500],
    },
    {
      parameters: {
        method: "POST",
        url: "={{ ($env.AEGIS_API_URL || 'https://api.salanor.com').replace(/\\/+$/, '') + ($json.obligationTraceId ? '/v1/aegis/workflows/runs/' + encodeURIComponent($json.obligationTraceId) + '/complete' : '/v1/aegis/workflows/runs') }}",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: "Content-Type", value: "application/json" }],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.aegisBody) }}",
        options: {},
      },
      id: "sync-aegis-0020",
      name: "11. Record in Aegis",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [3740, 500],
      credentials: {
        httpHeaderAuth: {
          id: "CONFIGURE_AEGIS_INGEST",
          name: "Aegis Ingest API Header Auth",
        },
      },
    },
  );

  wf.connections["9. Summary"] = {
    main: [[{ node: "10. Prepare Aegis capture", type: "main", index: 0 }]],
  };
  wf.connections["10. Prepare Aegis capture"] = {
    main: [[{ node: "11. Record in Aegis", type: "main", index: 0 }]],
  };
}

function addErrorTriggerPath(wf) {
  const failurePrepareCode = String.raw`/**
 * Close the governed trace when n8n stops on an error (credentials, HTTP 4xx, etc.).
 */
const err = $input.first().json;
let aegisPolicy = null;
try {
  const row = $('7b. Check Policy (publish)').first().json;
  aegisPolicy = row.aegis_policy ?? null;
} catch {}

const message =
  err.execution?.error?.message ??
  err.error?.message ??
  err.message ??
  'Workflow failed';

return [{
  json: {
    ...(aegisPolicy ? { aegis_policy: aegisPolicy } : {}),
    aegis_tool: 'jmts.content.publish',
    failure_summary: String(message).slice(0, 500),
  },
}];`;

  wf.nodes.push(
    {
      parameters: {},
      id: "sync-gov-error-trigger",
      name: "Error Trigger",
      type: "n8n-nodes-base.errorTrigger",
      typeVersion: 1,
      position: [3520, 720],
    },
    {
      parameters: { jsCode: failurePrepareCode },
      id: "sync-gov-error-prepare",
      name: "E1. Prepare failure capture",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3740, 720],
    },
    {
      parameters: {
        operation: "recordRun",
        businessContext: "JMT-S daily content sync from Google Drive",
        summary: "={{ $json.failure_summary }}",
        runStatus: "failed",
        nodesJson: "[]",
      },
      id: "sync-gov-error-record",
      name: "E2. Record failure in Aegis",
      type: "n8n-nodes-salanor-aegis.salanorAegis",
      typeVersion: 1,
      position: [3960, 720],
      credentials: {
        salanorAegisApi: {
          id: "CONFIGURE_SALANOR_AEGIS",
          name: "Salanor Aegis API",
        },
      },
    },
  );

  wf.connections["Error Trigger"] = {
    main: [[{ node: "E1. Prepare failure capture", type: "main", index: 0 }]],
  };
  wf.connections["E1. Prepare failure capture"] = {
    main: [[{ node: "E2. Record failure in Aegis", type: "main", index: 0 }]],
  };
}

function buildVariant(mode) {
  const wf = loadBase();
  stripAutoPublishFromConfig(wf);

  const governed = mode === "governed";
  patchSummaryNode(wf, { governed });
  removeAutoPublishGate(wf);

  if (governed) {
    addPublishGateNodes(wf);
  } else {
    stripPublishPath(wf);
  }

  addAegisCapture(wf, { includePolicyStep: governed });

  if (governed) {
    addErrorTriggerPath(wf);
  }

  wf.name = governed
    ? "JMT-S Content Sync (Drive + OpenAI + Aegis governed)"
    : "JMT-S Content Sync (Drive + OpenAI + Aegis audit)";
  wf.meta = {
    templateCredsSetupCompleted: false,
    description: governed
      ? "Drive-to-CMS sync. Dry-run always; live publish requires Console approval on jmts.content.publish. Records signed trace at end. Error Trigger closes the trace on workflow failure."
      : "Drive-to-CMS sync with dry-run validation and signed Aegis trace. No live publish.",
  };

  return wf;
}

function writeAll(name, wf) {
  const json = JSON.stringify(wf, null, 2);
  const targets = [
    path.join(examplesOut, name),
    path.join(integrationOut, name),
  ];
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json);
    console.log(`Wrote ${target} (${wf.nodes.length} nodes)`);
  }
}

writeAll(
  "jmt-s-content-sync-with-aegis.json",
  buildVariant("governed"),
);
writeAll(
  "jmt-s-content-sync-with-aegis-audit.json",
  buildVariant("audit"),
);
