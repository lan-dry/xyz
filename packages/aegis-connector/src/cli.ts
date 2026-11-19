#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generateKeyPair } from "@salanor/aegis-sdk";
import { loadConfigFile } from "./config.js";
import { createConnector } from "./connector.js";
import { writePrivateKey } from "./keystore.js";

const USAGE = `aegis-connector - AEGIS-SRC1 source connector

Usage:
  aegis-connector keygen --out <key-file> [--force]
      Generate an Ed25519 key pair. Writes the private key to <key-file> (mode 0600) and prints
      the public key to register with Aegis. If AEGIS_KEY_PASSPHRASE is set the file is encrypted.
      Without --out, private_key_path from the config is used.

  aegis-connector start [--config <file>]
      Run the connector HTTP server (POST /events, GET /health).

Options:
  --config <file>   Config JSON (default: $AEGIS_CONNECTOR_CONFIG or ./aegis-connector.config.json)
  --out <file>      keygen: private key output path
  --force           keygen: overwrite an existing key file
  -h, --help
`;

function configPath(value: string | undefined): string {
  return value ?? process.env.AEGIS_CONNECTOR_CONFIG ?? "aegis-connector.config.json";
}

async function keygen(values: { out?: string; config?: string; force?: boolean }): Promise<void> {
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
    process.env.AEGIS_KEY_PASSPHRASE
      ? "private key is encrypted (AES-256-GCM, scrypt); keep the passphrase safe"
      : "private key is stored unencrypted with mode 0600 (dev use); set AEGIS_KEY_PASSPHRASE to encrypt",
  );
  if (process.platform === "win32") {
    console.log("note: POSIX modes are not enforced on Windows; restrict the file with NTFS ACLs");
  }
  console.log("Register the public key (with your key_id) in Aegis; never share the private key file.");
}

async function start(values: { config?: string }): Promise<void> {
  const config = loadConfigFile(configPath(values.config));
  const connector = await createConnector(config);
  const addr = await connector.listen();
  console.log(
    JSON.stringify({
      msg: "aegis-connector listening",
      host: addr.host,
      port: addr.port,
      source_id: config.source_id,
      key_id: config.key_id,
      public_key_b64: connector.publicKeyB64,
    }),
  );
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ msg: "aegis-connector stopping", signal }));
    connector.close().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error(err);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    process.exit(command || values.help ? 0 : 2);
  }
  if (command === "keygen") return keygen(values);
  if (command === "start") return start(values);
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  process.exit(2);
}

main().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
