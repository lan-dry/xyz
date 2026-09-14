#!/usr/bin/env node
/**
 * Third-party verifier CLI — no @salanor workspace imports.
 *
 * Usage: node verify.mts --api http://127.0.0.1:8080 --org dev-org --event <event_id>
 */
import { verifyPublicBundle, type PublicBundle } from "./verify-lib.js";

function parseArgs(argv: string[]): {
  apiBase: string;
  orgSlug: string;
  eventId: string;
} {
  let apiBase = process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080";
  let orgSlug = "dev-org";
  let eventId = "";

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--api" && argv[i + 1]) {
      apiBase = argv[++i]!;
    } else if (arg === "--org" && argv[i + 1]) {
      orgSlug = argv[++i]!;
    } else if ((arg === "--event" || arg === "--event-id") && argv[i + 1]) {
      eventId = argv[++i]!;
    } else if (!arg.startsWith("-") && !eventId) {
      eventId = arg;
    }
  }

  if (!eventId) {
    console.error(
      "Usage: verify.mts --api <base> --org <slug> --event <event_id>",
    );
    process.exit(1);
  }

  return { apiBase: apiBase.replace(/\/$/, ""), orgSlug, eventId };
}

async function main(): Promise<void> {
  const { apiBase, orgSlug, eventId } = parseArgs(process.argv);
  const url = `${apiBase}/v1/public/orgs/${orgSlug}/verify/${eventId}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Fetch failed (${response.status}): ${await response.text()}`);
    process.exit(1);
  }

  const bundle = (await response.json()) as PublicBundle;
  const result = verifyPublicBundle(bundle);
  console.log(JSON.stringify({ event_id: eventId, verification: result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
