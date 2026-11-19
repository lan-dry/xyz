/**
 * Minimal key I/O (same file format as @salanor/aegis-connector).
 * Kept local so the collector stays a separate process/credential surface.
 */
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import { promisify } from "node:util";
import { base64urlDecode } from "@salanor/aegis-sdk";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Uint8Array,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const AAD = Buffer.from("AEGIS-SRC1-KEY-v1", "utf8");
const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

interface PlainKeyFile {
  v: 1;
  alg: "ed25519";
  enc: "none";
  seed_b64: string;
}

interface EncryptedKeyFile {
  v: 1;
  alg: "ed25519";
  enc: "aes-256-gcm";
  kdf: "scrypt";
  kdf_params: { N: number; r: number; p: number };
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}

type KeyFile = PlainKeyFile | EncryptedKeyFile;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Buffer> {
  return scryptAsync(passphrase, salt, 32, KDF);
}

export async function writePrivateKey(
  path: string,
  seed: Uint8Array,
  options: { passphrase?: string; force?: boolean } = {},
): Promise<void> {
  if (seed.length !== 32) throw new Error("Ed25519 seed must be 32 bytes");
  let file: KeyFile;
  if (options.passphrase) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(options.passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    const ct = Buffer.concat([cipher.update(seed), cipher.final()]);
    file = {
      v: 1,
      alg: "ed25519",
      enc: "aes-256-gcm",
      kdf: "scrypt",
      kdf_params: { N: KDF.N, r: KDF.r, p: KDF.p },
      salt: salt.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ct: ct.toString("base64url"),
    };
  } else {
    file = {
      v: 1,
      alg: "ed25519",
      enc: "none",
      seed_b64: Buffer.from(seed).toString("base64"),
    };
  }
  try {
    await stat(path);
    if (!options.force) throw new Error(`Key file already exists: ${path}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
  try {
    await chmod(path, 0o600);
  } catch {
    /* Windows */
  }
}

export async function readPrivateKey(
  path: string,
  passphrase?: string,
): Promise<Uint8Array> {
  const text = await readFile(path, "utf8");
  const file = JSON.parse(text) as KeyFile;
  if (file.v !== 1 || file.alg !== "ed25519") {
    throw new Error("Unsupported key file");
  }
  if (file.enc === "none") {
    const seed = Buffer.from(file.seed_b64, "base64");
    if (seed.length !== 32) throw new Error("Invalid seed length");
    return new Uint8Array(seed);
  }
  if (!passphrase) {
    throw new Error("Key file is encrypted; set AEGIS_KEY_PASSPHRASE");
  }
  const salt = base64urlDecode(file.salt);
  const iv = base64urlDecode(file.iv);
  const tag = base64urlDecode(file.tag);
  const ct = base64urlDecode(file.ct);
  if (!salt || !iv || !tag || !ct) throw new Error("Corrupt encrypted key file");
  const key = await deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tag));
  const seed = Buffer.concat([
    decipher.update(Buffer.from(ct)),
    decipher.final(),
  ]);
  if (seed.length !== 32) throw new Error("Invalid decrypted seed length");
  return new Uint8Array(seed);
}
