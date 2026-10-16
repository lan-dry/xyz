export function mergeVaults(
  vaults: Record<string, string>[],
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const v of vaults) {
    Object.assign(merged, v);
  }
  return merged;
}

const WELL_FORMED = /^\[([A-Z][A-Z0-9_]*_\d+)\]$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace upstream placeholders with the user's original values so replies can be
 * read and copied as if the values had been sent. Tolerates the variants models
 * produce: `[EMAIL_1]`, markdown-escaped `\[EMAIL_1\]`, `[ EMAIL_1 ]`, bare `EMAIL_1`.
 */
export function rehydrateText(
  text: string,
  vault: Record<string, string>,
): string {
  if (!text) {
    return text;
  }
  const byCore = new Map<string, string>();
  const literal: [string, string][] = [];
  for (const [token, original] of Object.entries(vault)) {
    const m = WELL_FORMED.exec(token);
    if (m) {
      byCore.set(m[1], original);
    } else {
      literal.push([token, original]);
    }
  }

  let out = text;
  for (const [token, original] of literal.sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(token).join(original);
  }
  if (byCore.size === 0) {
    return out;
  }

  const cores = [...byCore.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  const re = new RegExp(
    `\\\\?\\[\\s*(${cores})\\s*\\\\?\\]|\\b(${cores})\\b`,
    "g",
  );
  return out.replace(re, (whole, bracketed: string | undefined, bare: string | undefined) => {
    const core = bracketed ?? bare;
    return (core && byCore.get(core)) ?? whole;
  });
}
