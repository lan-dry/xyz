import "../src/db/load-env.js";
import { getPool, closePool } from "../src/db/pool.js";
import { redactPrompt } from "../src/dlp/redact.js";
import { mergeVaults, rehydrateText } from "../src/dlp/rehydrate.js";
import {
  buildRedactionInstructions,
  withRedactionSystemMessage,
} from "../src/dlp/upstream-instructions.js";
import { buildPlaceholderHints } from "../src/dlp/placeholder-hints.js";
import { getOrgEmailDomains } from "../src/tenant/org-domains.js";
import { sealVault, openVault } from "../src/dlp/vault-crypto.js";
import { upstreamFingerprint } from "../src/dlp/message-presentation.js";
import { getTenantSettings } from "../src/tenant/settings.js";
import { completeChat, type ChatMessage } from "../src/llm/openai.js";

const tenant = await getPool().query<{ id: string }>(
  `SELECT id FROM stoa_tenant WHERE slug = 'org-f79af136cd06'`,
);
const tenantId = tenant.rows[0]!.id;
const settings = await getTenantSettings(tenantId);
const dlp = {
  profile: settings.dlp.profile,
  customTerms: settings.dlp.customTerms,
  customPatterns: settings.dlp.customPatterns,
};
const orgDomains = [...(await getOrgEmailDomains(tenantId)), "afribank.cm"];

const turn1 = `Bonjour, j'ai besoin d'aide pour répondre à une réclamation client.

Cliente : Mme Aïcha Mbarga, CNI n° 114587236, tél. +237 677 45 12 89, email aicha.mbarga@yahoo.fr.
Elle dit que son virement de 1 750 000 FCFA du 08/10/2026 n'est jamais arrivé chez son fournisseur.
- Compte débité : 10005 00012 04587123301
- IBAN du bénéficiaire : CM21 1003 3050 0102 3456 7890 145
- Référence de l'opération : TRX-20261008-77412
- Sa carte Visa 4111 1111 1111 1111 a été bloquée par précaution le même jour.

Après vérification, le virement a été rejeté par la banque du bénéficiaire pour IBAN incorrect et les fonds seront recrédités sous 48 h. Frais de rejet : 2 500 FCFA, remboursés à titre commercial.

Rédige un e-mail professionnel en français pour la cliente : excuse-toi, explique la situation, rappelle les numéros de compte, d'IBAN et la référence pour qu'elle puisse vérifier, et indique qu'elle peut nous joindre au +237 222 23 40 00 ou à reclamations@afribank.cm.`;

const turn2 =
  "Merci. Fais maintenant une version SMS de 300 caractères maximum, avec la référence de l'opération et le numéro de la cliente pour que je l'envoie au bon numéro.";

const SENSITIVE = [
  "Aïcha Mbarga", // not pattern-detectable: expected to go through (known gap)
  "114587236",
  "677 45 12 89",
  "aicha.mbarga",
  "10005 00012 04587123301",
  "04587123301",
  "CM21 1003",
  "7890 145",
  "77412",
  "4111 1111",
];
const MUST_STAY = [
  "1 750 000 FCFA",
  "08/10/2026",
  "2 500 FCFA",
  "48 h",
];

const history: ChatMessage[] = [];
const vaults: Record<string, string>[] = [];

for (const [i, userText] of [turn1, turn2].entries()) {
  const priorVault = mergeVaults(vaults);
  const r = redactPrompt(userText, { ...dlp, priorVault });
  vaults.push(r.vault);

  const sealed = sealVault(r.vault);
  const vaultRoundTrips =
    JSON.stringify(openVault(sealed)) === JSON.stringify(r.vault);

  history.push({ role: "user", content: r.text });
  const threadVault = mergeVaults(vaults);
  const reply = await completeChat(
    tenantId,
    settings.defaultModelId ?? "google:gemini-2.5-flash",
    withRedactionSystemMessage<ChatMessage>(
      [...history],
      buildRedactionInstructions(threadVault, { orgDomains }),
    ),
  );
  history.push({ role: "assistant", content: reply });

  const fullVault = mergeVaults(vaults);
  const shown = rehydrateText(reply, fullVault);
  const placeholdersInReply = [
    ...new Set(reply.match(/\[[A-Z][A-Z0-9_]*_\d+\]/g) ?? []),
  ];

  console.log(`\n################ TURN ${i + 1} ################`);
  console.log("\n=== 1. SENT TO GEMINI ===\n" + r.text);
  console.log("\n=== 2. WITHHELD (admin proof) ===");
  for (const item of r.items) {
    console.log(`  ${item.token.padEnd(12)} ${item.group.padEnd(15)} ${item.value}`);
  }
  console.log(`  manifest: ${r.manifest.map((m) => `${m.label} x${m.count}`).join(", ") || "(none)"}`);
  console.log(`  upstream sha256: ${upstreamFingerprint(r.text)}`);
  console.log(
    "\n=== 2b. SAFE FACTS GIVEN TO GEMINI ===\n" +
      buildPlaceholderHints(threadVault, { orgDomains }).join("\n"),
  );
  console.log("\n=== 3. RAW GEMINI REPLY ===\n" + reply);
  console.log("\n=== 4. WHAT THE EMPLOYEE SEES / COPIES ===\n" + shown);

  const checks = {
    noSensitiveFragmentUpstream: SENSITIVE.slice(1)
      .filter((s) => r.text.includes(s))
      .join(", ") || "OK",
    publicAndBusinessValuesKept:
      i === 0
        ? MUST_STAY.filter((s) => !r.text.includes(s)).join(", ") || "OK"
        : "n/a",
    vaultEncryptRoundTrip: vaultRoundTrips ? "OK" : "FAILED",
    placeholdersUsedByModel: placeholdersInReply.join(" ") || "(none)",
    unrestoredInDisplay:
      (shown.match(/\[[A-Z][A-Z0-9_]*_\d+\]/g) ?? []).join(" ") || "OK",
    restoredValuesInDisplay: placeholdersInReply
      .filter((t) => fullVault[t] && shown.includes(fullVault[t]))
      .length + `/${placeholdersInReply.length}`,
    reusedPlaceholdersFromTurn1:
      i === 1
        ? Object.keys(r.vault).filter((t) => t in vaults[0]!).join(" ") || "(none)"
        : "n/a",
  };
  console.log("\n=== 5. CHECKS ===");
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${k.padEnd(30)} ${v}`);
  }
}
await closePool();
