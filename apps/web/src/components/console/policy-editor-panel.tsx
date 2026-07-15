"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/console/button";
import { StatusChip } from "@/components/console/status-chip";
import { DEFAULT_POLICY_TEMPLATE } from "@/lib/aegis/policy";
import { formatDateTime } from "@/lib/format-datetime";

type PolicySummary = {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  createdAt: string;
  rules: unknown;
};

type PolicyEditorPanelProps = {
  canManagePolicy: boolean;
  activePolicy: PolicySummary | null;
  recentPolicies: PolicySummary[];
};

type ValidateResult = {
  ok: boolean;
  errors: string[];
};

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function PolicyEditorPanel({
  canManagePolicy,
  activePolicy,
  recentPolicies,
}: PolicyEditorPanelProps) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(activePolicy?.name ?? "Default policy");
  const [rawRules, setRawRules] = useState(
    prettyJson(activePolicy?.rules ?? DEFAULT_POLICY_TEMPLATE),
  );
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [manifestText, setManifestText] = useState("");
  const [manifestResult, setManifestResult] = useState<ValidateResult | null>(null);

  const currentVersionLabel = useMemo(() => {
    if (!activePolicy) return "No active policy";
    return `${activePolicy.name} v${activePolicy.version}`;
  }, [activePolicy]);

  async function validateRules(): Promise<ValidateResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawRules);
    } catch {
      return { ok: false, errors: ["Invalid JSON: could not parse policy rules."] };
    }

    const res = await fetch("/api/console/policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        rules: parsed,
        dryRun: true,
        runSmokeTest: false,
      }),
    });
    const payload = (await res.json().catch(() => null)) as {
      error?: string;
      details?: string[];
      valid?: boolean;
    } | null;
    if (!res.ok || payload?.valid === false) {
      const fallback = payload?.error
        ? `${payload.error} (HTTP ${res.status})`
        : `Policy validation failed (HTTP ${res.status}).`;
      return {
        ok: false,
        errors: payload?.details?.length ? payload.details : [fallback],
      };
    }
    return { ok: true, errors: [] };
  }

  async function savePolicy(): Promise<void> {
    setError(null);
    setInfo(null);
    const parsed = await validateRules();
    setValidation(parsed);
    if (!parsed.ok) {
      return;
    }

    let parsedRules: unknown;
    try {
      parsedRules = JSON.parse(rawRules);
    } catch {
      setError("Invalid JSON: could not parse policy rules.");
      return;
    }

    const res = await fetch("/api/console/policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        rules: parsedRules,
        runSmokeTest: true,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string[];
      policy?: { version?: number };
    };
    if (!res.ok) {
      setError(payload.details?.length ? payload.details.join("\n") : payload.error ?? "Could not save policy.");
      return;
    }
    setInfo(`Policy saved${payload.policy?.version ? ` (v${payload.policy.version})` : ""}. Refresh to see latest state.`);
  }

  async function downloadManifest(): Promise<void> {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/console/policy/manifest");
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      manifest?: { version?: number };
    };
    if (!res.ok || !payload.manifest) {
      setError(payload.error ?? "Could not load policy manifest.");
      return;
    }
    const fileName = `aegis-policy-v${payload.manifest.version ?? "latest"}.json`;
    const blob = new Blob([`${JSON.stringify(payload.manifest, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setInfo(`Downloaded ${fileName}.`);
  }

  async function verifyManifestInput(): Promise<void> {
    setManifestResult(null);
    setError(null);
    setInfo(null);
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      setManifestResult({ ok: false, errors: ["Invalid JSON: could not parse manifest."] });
      return;
    }
    const res = await fetch("/api/console/policy/verify-manifest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      valid?: boolean;
      errors?: string[];
      error?: string;
    };
    if (!res.ok || payload.valid === false) {
      setManifestResult({
        ok: false,
        errors: payload.errors?.length ? payload.errors : [payload.error ?? "Manifest verification failed."],
      });
      return;
    }
    setManifestResult({ ok: true, errors: [] });
    setInfo("Manifest signature and hash verified.");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Active policy</h3>
        <p className="mt-2 text-sm text-ink/80">{currentVersionLabel}</p>
        {activePolicy ? (
          <p className="mt-1 text-xs text-ink/60">Last updated {formatDateTime(activePolicy.createdAt)}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Policy rules (JSON)</h3>
        {!canManagePolicy ? (
          <p className="mt-2 text-sm text-ink/70">Read-only: policy editing requires admin or owner role.</p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-ink/80">
            Policy name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManagePolicy || pending}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </label>

          <label className="block text-sm text-ink/80">
            Rules JSON
            <textarea
              value={rawRules}
              onChange={(e) => setRawRules(e.target.value)}
              disabled={!canManagePolicy || pending}
              className="mt-1 h-72 w-full rounded-lg border border-black/10 p-3 font-mono text-xs focus:border-teal focus:outline-none"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={!canManagePolicy || pending}
            variant="secondary"
            onClick={() => {
              setRawRules(prettyJson(DEFAULT_POLICY_TEMPLATE));
              setValidation(null);
              setError(null);
              setInfo("Loaded policy template v1.");
            }}
          >
            Load template
          </Button>
          <Button
            type="button"
            disabled={!canManagePolicy || pending}
            variant="secondary"
            onClick={() => {
              startTransition(async () => {
                setError(null);
                setInfo(null);
                const result = await validateRules();
                setValidation(result);
                if (result.ok) {
                  setInfo("Policy JSON is valid.");
                }
              });
            }}
          >
            Validate
          </Button>
          <Button
            type="button"
            disabled={!canManagePolicy || pending}
            onClick={() => {
              startTransition(async () => {
                await savePolicy();
              });
            }}
          >
            Save and enable
          </Button>
        </div>

        {validation && !validation.ok ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Validation errors</p>
            <ul className="mt-2 list-disc pl-5">
              {validation.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <p className="mt-3 whitespace-pre-line text-sm text-red-700">{error}</p> : null}
        {info ? <p className="mt-3 text-sm text-emerald-700">{info}</p> : null}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Recent policy versions</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Version</th>
              <th className="px-3 py-3">Enabled</th>
              <th className="px-3 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {recentPolicies.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-ink/70">
                  No policy versions yet.
                </td>
              </tr>
            ) : (
              recentPolicies.map((policy) => (
                <tr key={policy.id} className="border-t border-black/5 transition-colors duration-150 hover:bg-black/[0.02]">
                  <td className="px-3 py-3">{policy.name}</td>
                  <td className="px-3 py-3">v{policy.version}</td>
                  <td className="px-3 py-3">
                    {policy.enabled ? <StatusChip tone="positive">enabled</StatusChip> : <StatusChip>draft</StatusChip>}
                  </td>
                  <td className="px-3 py-3">{formatDateTime(policy.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Signed policy manifest</h3>
        <p className="mt-2 text-sm text-ink/80">
          Export the active policy manifest for pinning/integrity and verify manifest signatures.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={!canManagePolicy || pending}
            variant="secondary"
            onClick={() => {
              startTransition(async () => {
                await downloadManifest();
              });
            }}
          >
            Download manifest
          </Button>
          {!canManagePolicy ? (
            <p className="text-sm text-ink/70">Download requires admin or owner role.</p>
          ) : null}
        </div>

        <label className="mt-4 block text-sm text-ink/80">
          Verify manifest JSON
          <textarea
            className="mt-1 h-40 w-full rounded-lg border border-black/10 p-3 font-mono text-xs focus:border-teal focus:outline-none"
            spellCheck={false}
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            placeholder='Paste manifest JSON here, then click "Verify manifest".'
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="application/json,.json"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const text = typeof reader.result === "string" ? reader.result : "";
                setManifestText(text);
              };
              reader.readAsText(file);
            }}
          />
          <Button
            type="button"
            disabled={pending || manifestText.trim().length === 0}
            variant="secondary"
            onClick={() => {
              startTransition(async () => {
                await verifyManifestInput();
              });
            }}
          >
            Verify manifest
          </Button>
        </div>

        {manifestResult && !manifestResult.ok ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Manifest verification errors</p>
            <ul className="mt-2 list-disc pl-5">
              {manifestResult.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {manifestResult?.ok ? (
          <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Manifest is valid.
          </p>
        ) : null}
      </div>
    </div>
  );
}
