/**
 * Scenarios A–G against the real API through Connectors (when bank simulator is up).
 * Also usable as a unit-ish check of story card definitions.
 *
 *   node tools/bank-simulator/scenarios-ag.mjs           # card inventory only
 *   node tools/bank-simulator/scenarios-ag.mjs --live    # POST each story to simulator
 *
 * Velocity timings (when --live and B runs): printed as measured ms only — no claims.
 */
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STORIES, getStory } from "./stories.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes("--live");
const BASE = process.env.BANK_SIM_URL?.trim() || "http://127.0.0.1:4000";
const OUT_DIR = resolve(HERE, "../../docs/TEST_PACK/scenarios-ag");

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function httpJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-simulator": "1",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function runLetter(letter) {
  const story = getStory(letter);
  assert(story, `missing story ${letter}`);
  if (letter === "B" && story.setup === "velocity_prior_three") {
    // Seed three prior transfers for the same customer (2.4M each) via story clone.
    const priorChannels = ["mobile", "branch", "agent"];
    for (let i = 0; i < 3; i++) {
      const prior = {
        ...story,
        id: `scenario_b_prior_${i + 1}`,
        attributes: {
          ...story.attributes,
          channel: priorChannels[i],
          amount: 2_400_000,
        },
      };
      // Priors are injected inside runStory when setup=velocity_prior_three.
      void prior;
    }
  }
  const started = performance.now();
  const out = await httpJson("/api/story", { story_id: story.id });
  const ms = Math.round(performance.now() - started);
  return { letter, story_id: story.id, ms, ...out };
}

function inventory() {
  const rows = LETTERS.map((L) => {
    const s = getStory(L);
    assert(s, `scenario ${L} missing`);
    return {
      letter: L,
      id: s.id,
      title: s.title,
      expect: s.expect,
      expect_detail: s.expect_detail,
      customer_id: s.attributes?.customer_id,
      amount: s.attributes?.amount,
      segment: s.attributes?.segment,
      channel: s.attributes?.channel,
      product: s.product,
    };
  });
  console.log(JSON.stringify({ ok: true, mode: "inventory", scenarios: rows }, null, 2));
  return rows;
}

async function live() {
  mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  for (const L of LETTERS) {
    console.log(`\n=== Scenario ${L} ===`);
    try {
      const r = await runLetter(L);
      results.push(r);
      const file = resolve(OUT_DIR, `scenario-${L.toLowerCase()}.json`);
      writeFileSync(file, JSON.stringify(r, null, 2));
      console.log(
        JSON.stringify(
          {
            letter: L,
            status: r.status,
            outcome: r.data?.outcome,
            expect: getStory(L)?.expect,
            case_id: r.data?.case_id,
            plain_summary: r.data?.plain_summary,
            ms: r.ms,
            velocity_query_ms: r.data?.velocity_query_ms ?? null,
            execute_refused: r.data?.execute_refused ?? null,
            fraud_release: r.data?.fraud_release ?? null,
            ledger_edit: r.data?.ledger_edit ?? null,
            dual_publish: r.data?.dual_publish ?? null,
            steps_tail: (r.data?.steps || []).slice(-6),
          },
          null,
          2,
        ),
      );
    } catch (err) {
      results.push({ letter: L, error: String(err) });
      console.error(L, err);
    }
  }
  const summary = resolve(OUT_DIR, "summary.json");
  writeFileSync(
    summary,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        bank_sim: BASE,
        results: results.map((r) => ({
          letter: r.letter,
          status: r.status,
          outcome: r.data?.outcome,
          case_id: r.data?.case_id,
          plain_summary: r.data?.plain_summary,
          ms: r.ms,
          velocity_query_ms: r.data?.velocity_query_ms ?? null,
          execute_refused: r.data?.execute_refused ?? null,
          fraud_release: r.data?.fraud_release ?? null,
          ledger_edit: r.data?.ledger_edit ?? null,
          dual_publish: r.data?.dual_publish ?? null,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${summary}`);
}

if (LIVE) {
  await live();
} else {
  inventory();
  // Lightweight self-check: expect strings mention governance labels where required.
  const b = getStory("B");
  assert(
    /Retail Standard|counts only activity reported to Aegis/i.test(b.expect_detail),
    "B expect_detail must name Retail Standard + Aegis-only counts",
  );
  const c = getStory("C");
  assert(/0\.94|Fraud Analyst/i.test(c.expect_detail), "C must mention score + Fraud Analyst");
  console.log("\nself-check OK");
}
