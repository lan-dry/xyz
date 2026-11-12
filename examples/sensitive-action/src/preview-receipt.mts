/**
 * Print the plain-language receipt for a SensitiveAction JSON file.
 * Does not call the API — useful while writing a new example.
 *
 *   pnpm preview -- examples/loan-decision.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatReceiptStory } from "./receipt-story.js";
import type { SensitiveAction } from "./types.js";

const fileArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!fileArg) {
  console.error("Usage: pnpm preview -- <path-to-action.json>");
  process.exit(1);
}

const action = JSON.parse(
  readFileSync(resolve(process.cwd(), fileArg), "utf8"),
) as SensitiveAction;

console.log(formatReceiptStory(action));
