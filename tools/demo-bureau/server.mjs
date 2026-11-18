#!/usr/bin/env node
/**
 * Tiny Demo Credit Bureau HTTP stub.
 *
 *   POST /v1/score  { "subject_id": "LN-1", "credit_score": 612 }
 *   → { "envelope": <AEGIS-SRC1>, "public_key_b64", "source_id", "key_id", "name" }
 *
 *   GET /v1/keys → registration payload for Aegis source registry (kind=third_party)
 */
import { createServer } from "node:http";
import {
  DEMO_BUREAU_NAME,
  getOrCreateDemoBureauKeys,
  signCreditScoreResponse,
} from "./sign.mjs";

const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST?.trim() || "127.0.0.1";

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, name: DEMO_BUREAU_NAME });
    }
    if (req.method === "GET" && url.pathname === "/v1/keys") {
      const keys = await getOrCreateDemoBureauKeys();
      return send(res, 200, {
        source_id: keys.source_id,
        key_id: keys.key_id,
        name: keys.name,
        kind: "third_party",
        public_key_b64: keys.public_key_b64,
      });
    }
    if (req.method === "POST" && url.pathname === "/v1/score") {
      const body = await readJson(req);
      const score = Number(body.credit_score ?? body.score);
      if (!Number.isFinite(score)) {
        return send(res, 400, { error: "credit_score is required" });
      }
      const keys = await getOrCreateDemoBureauKeys();
      const envelope = await signCreditScoreResponse({
        credit_score: score,
        subject_id: typeof body.subject_id === "string" ? body.subject_id : undefined,
        seq: typeof body.seq === "number" ? body.seq : undefined,
        private_key_b64: keys.private_key_b64,
        source_id: keys.source_id,
        key_id: keys.key_id,
      });
      return send(res, 200, {
        name: keys.name,
        source_id: keys.source_id,
        key_id: keys.key_id,
        public_key_b64: keys.public_key_b64,
        envelope,
      });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`demo-bureau listening on http://${HOST}:${PORT}`);
});
