import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "jmt-s-content-sync.json");
const out = path.join(dir, "jmt-s-content-sync-with-aegis.json");

const wf = JSON.parse(fs.readFileSync(src, "utf8"));
wf.name = "JMT-S Content Sync (Drive + OpenAI + Aegis)";
wf.meta = {
  templateCredsSetupCompleted: false,
  description:
    "Daily Drive-to-CMS sync with OpenAI diff. Records a signed Aegis trace at the end. Enable Workflow Bridge on your agent and set AEGIS_API_URL in n8n.",
};

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

const runStatus =
  summary.status === 'FAILED' || summary.status === 'EXTRACTION_FAILED'
    ? 'failed'
    : 'completed';

return [{
  json: {
    aegisBody: {
      one_shot: true,
      business_context: 'JMT-S daily content sync from Google Drive',
      external_system: 'n8n',
      external_workflow_id: String($workflow.id),
      external_execution_id: String($execution.id),
      status: runStatus,
      summary:
        summary.status +
        (summary.updateCount != null ? ' — ' + summary.updateCount + ' update(s)' : ''),
      execution: {
        workflow_name: $workflow.name,
        execution_id: String($execution.id),
        nodes,
      },
    },
  },
}];`;

wf.nodes.push(
  {
    parameters: { jsCode: prepareCode },
    id: "sync-aegis-0010",
    name: "10. Prepare Aegis capture",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [3520, 500],
  },
  {
    parameters: {
      method: "POST",
      url: "={{ ($env.AEGIS_API_URL || 'https://api.salanor.com').replace(/\\/+$/, '') }}/v1/aegis/workflows/runs",
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
        name: "Aegis Ingest API — Header Auth",
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

fs.writeFileSync(out, JSON.stringify(wf, null, 2));
console.log(`Wrote ${out} (${wf.nodes.length} nodes)`);
