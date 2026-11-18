#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generateKeyPair } from "@salanor/aegis-sdk";
import { loadConfigFile } from "./config.js";
import { createCollector } from "./collector.js";
import { writePrivateKey } from "./keystore.js";
import { checkLogicalDecoding, PgoutputLogicalStream } from "./pgoutput.js";

const USAGE = `aegis-collector-pg - Independent Postgres CDC collector (AEGIS-SRC1)

Usage:
  aegis-collector-pg keygen --out <key-file> [--force]
  aegis-collector-pg check [--config <file>]
      Probe database_url for wal_level=logical readiness.
  aegis-collector-pg start [--config <file>]
      Run the pgoutput collector (requires wal_level=logical).

Options:
  --config <file>   Config JSON (default: $AEGIS_COLLECTOR_CONFIG or ./aegis-collector-pg.config.json)
  --out <file>      keygen: private key output path
  --force           keygen: overwrite an existing key file
  -h, --help

Register source_id (default src_core_cdc) with kind=collector and a dedicated
ingest bearer. Use a DB role that is NOT the application role.
`;

function configPath(value: string | undefined): string {
  return (
    value ??
    process.env.AEGIS_COLLECTOR_CONFIG ??
    "aegis-collector-pg.config.json"
  );
}

async function keygen(values: {
  out?: string;
  config?: string;
  force?: boolean;
}): Promise<void> {
  let out = values.out;
  if (!out) {
    out = loadConfigFile(configPath(values.config)).private_key_path;
  }
  const keys = await generateKeyPair();
  await writePrivateKey(out, keys.privateKey, {
    passphrase: process.env.AEGIS_KEY_PASSPHRASE || undefined,
    force: values.force,
  });
  console.log(`public_key_b64: ${keys.publicKeyB64}`);
  console.log(`private_key_file: ${out}`);
  console.log(
    "Register as source kind=collector (e.g. src_core_cdc); never share the private key.",
  );
}

async function check(values: { config?: string }): Promise<void> {
  const config = loadConfigFile(configPath(values.config));
  const status = await checkLogicalDecoding(config.database_url);
  console.log(JSON.stringify({ source_id: config.source_id, ...status }, null, 2));
  if (!status.ready) process.exitCode = 2;
}

async function start(values: { config?: string }): Promise<void> {
  const config = loadConfigFile(configPath(values.config));
  const stream = new PgoutputLogicalStream(config);
  const collector = await createCollector(config, { stream });
  console.log(
    JSON.stringify({
      msg: "aegis-collector-pg starting",
      source_id: config.source_id,
      key_id: config.key_id,
      public_key_b64: collector.publicKeyB64,
      stream: stream.kind,
    }),
  );
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ msg: "aegis-collector-pg stopping", signal }));
    collector.stop().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error(err);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  try {
    const result = await collector.run();
    console.log(JSON.stringify({ msg: "aegis-collector-pg finished", ...result }));
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "aegis-collector-pg failed",
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : undefined,
      }),
    );
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    return;
  }
  const cmd = positionals[0];
  if (cmd === "keygen") {
    await keygen(values);
  } else if (cmd === "check") {
    await check(values);
  } else if (cmd === "start") {
    await start(values);
  } else {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(USAGE);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
