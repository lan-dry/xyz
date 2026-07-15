"use client";

import { useState } from "react";

type TabId = "python" | "typescript" | "verify";

const TABS: { id: TabId; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "typescript", label: "TypeScript" },
  { id: "verify", label: "Verify CLI" },
];

export function SdkCodeTabs() {
  const [active, setActive] = useState<TabId>("python");

  return (
    <div className="overflow-hidden rounded-lg bg-ink">
      <div className="flex border-b border-white/6 bg-white/[0.04]" role="tablist" aria-label="SDK examples">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`cursor-pointer border-b-2 px-4 py-2.5 font-mono text-[0.6875rem] transition-colors ${
              active === tab.id
                ? "border-teal bg-white/[0.03] text-white/80"
                : "border-transparent text-white/30 hover:text-white/50"
            }`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-5 font-mono text-[0.8125rem] leading-[1.85] sm:p-7" role="tabpanel">
        {active === "python" && (
          <pre className="overflow-x-auto whitespace-pre text-white/85">
            <span className="text-teal">from</span> salanor_aegis_ledger <span className="text-teal">import</span> aegis{"\n\n"}
            <span className="text-white/25"># Set once via env or config</span>
            {"\n"}
            <span className="text-white/25"># AEGIS_API_KEY=key_live_...</span>
            {"\n"}
            <span className="text-white/25"># AEGIS_TENANT_ID=ten_acme</span>
            {"\n\n"}
            decision = aegis.record({"{"}
            {"\n"}
            {"  "}subject={`{{"kind": "loan_application", "id": app.id}}`},{"\n"}
            {"  "}action=&quot;underwriting.decline&quot;,{"\n"}
            {"  "}model={`{{"id": "uw-v3.2", "weights_hash": weights_hash}}`},{"\n"}
            {"  "}policy={`{{"id": "underwriting/2026-Q1"}}`},{"\n"}
            {"  "}inputs=features,{"\n"}
            {"  "}outcome={`{{"decision": "decline", "reason": reason}}`},{"\n"}
            {")"}
            {"\n\n"}
            <span className="text-white/25"># Returns immediately — network is async</span>
            {"\n"}
            <span className="text-white/40">print</span>(decision.event_id){" "}
            <span className="text-white/25"># evt_01J7XZ4K...</span>
          </pre>
        )}
        {active === "typescript" && (
          <pre className="overflow-x-auto whitespace-pre text-white/85">
            <span className="text-teal">import</span> {"{ aegis }"} <span className="text-teal">from</span>{" "}
            <span className="text-teal-soft">&apos;@salanor/aegis&apos;</span>;{"\n\n"}
            <span className="text-teal">const</span> decision = <span className="text-teal">await</span> aegis.record({"{"}
            {"\n"}
            {"  "}subject: {"{ kind: "}
            <span className="text-teal-soft">&quot;loan_application&quot;</span>, id: app.id {"}"},{"\n"}
            {"  "}action: <span className="text-teal-soft">&quot;underwriting.decline&quot;</span>,{"\n"}
            {"  "}model: {"{ id: "}
            <span className="text-teal-soft">&quot;uw-v3.2&quot;</span> {"}"},{"\n"}
            {"  "}policy: {"{ id: "}
            <span className="text-teal-soft">&quot;underwriting/2026-Q1&quot;</span> {"}"},{"\n"}
            {"  "}inputs: features,{"\n"}
            {"  "}outcome: {"{"}
            {"\n"}
            {"    "}decision: <span className="text-teal-soft">&quot;decline&quot;</span>,{"\n"}
            {"    "}reason: <span className="text-teal-soft">&quot;score_below_threshold&quot;</span>,{"\n"}
            {"  }"},{"\n"}
            {"}"});{"\n\n"}
            <span className="text-white/25">// Fully typed. Returns Promise&lt;{"{event_id: string}"}&gt;</span>
            {"\n"}
            <span className="text-white/40">console</span>.log(decision.event_id);
          </pre>
        )}
        {active === "verify" && (
          <pre className="overflow-x-auto whitespace-pre text-white/85">
            <span className="text-white/25"># Install the open-source verification CLI</span>
            {"\n"}$ pip install aegis-verify{"\n\n"}
            <span className="text-white/25"># Verify any evidence pack — no Salanor account required</span>
            {"\n"}$ aegis-verify verify ./pack_01J7XZ.zip{"\n\n"}
            <span className="text-emerald-400">✓</span> APS-1 schema valid{"\n"}
            <span className="text-emerald-400">✓</span> Ed25519 signature verified (key: cust-key-1){"\n"}
            <span className="text-emerald-400">✓</span> Merkle inclusion proof valid{"\n"}
            <span className="text-emerald-400">✓</span> OpenTimestamps: Bitcoin block 843,291{"\n"}
            <span className="text-emerald-400">✓</span> Policy hash matches recorded{"\n"}
            <span className="text-emerald-400">✓</span> Model identity recorded{"\n\n"}
            <span className="text-teal-soft">VERDICT: cryptographically sound.</span>
          </pre>
        )}
      </div>
    </div>
  );
}
