import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { base64urlDecode } from "@salanor/aegis-sdk";
import { atomicWriteFile } from "./fsutil.js";

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

/**
 * Write a 32-byte Ed25519 seed to disk with mode 0600. If `passphrase` is set the seed is
 * encrypted (scrypt + AES-256-GCM); otherwise it is stored as base64 and protected only by
 * file permissions (dev/test use). Refuses to overwrite unless `force`.
 *
 * On Windows POSIX modes are not enforced; restrict the file with NTFS ACLs instead.
 */
export async function writePrivateKey(
  path: string,
  seed: Uint8Array,
  options: { passphrase?: string; force?: boolean } = {},
): Promise<void> {
  if (seed.length !== 32) {
    throw new Error("Ed25519 seed must be 32 bytes");
  }
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
    file = { v: 1, alg: "ed25519", enc: "none", seed_b64: Buffer.from(seed).toString("base64") };
  }
  const text = JSON.stringify(file, null, 2) + "\n";
  if (options.force) {
    await atomicWriteFile(path, text, 0o600);
  } else {
    try {
      await writeFile(path, text, { mode: 0o600, flag: "wx" });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Key file ${path} already exists; refusing to overwrite (use --force)`);
      }
      throw err;
    }
  }
  await chmod(path, 0o600).catch(() => undefined);
}

/** Read a seed written by {@link writePrivateKey}. Refuses group/world-accessible files on POSIX. */
export async function readPrivateKey(path: string, passphrase?: string): Promise<Uint8Array> {
  if (process.platform !== "win32") {
    const { mode } = await stat(path);
    if ((mode & 0o077) !== 0) {
      throw new Error(
        `Private key file ${path} is accessible by group/others (mode ${(mode & 0o777).toString(8)}); run: chmod 600 ${path}`,
      );
    }
  }
  let parsed: KeyFile;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as KeyFile;
  } catch (err) {
    throw new Error(`Cannot parse private key file ${path}: ${(err as Error).message}`);
  }
  if (parsed.v !== 1 || parsed.alg !== "ed25519") {
    throw new Error(`Unsupported private key file format: ${path}`);
  }
  if (parsed.enc === "none") {
    const seed = Buffer.from(parsed.seed_b64, "base64");
    if (seed.length !== 32) {
      throw new Error("Private key file does not contain a 32-byte seed");
    }
    return new Uint8Array(seed);
  }
  if (parsed.enc !== "aes-256-gcm") {
    throw new Error(`Unsupported private key encryption: ${(parsed as { enc: string }).enc}`);
  }
  if (!passphrase) {
    throw new Error("Private key file is encrypted; set AEGIS_KEY_PASSPHRASE");
  }
  const salt = base64urlDecode(parsed.salt);
  const iv = base64urlDecode(parsed.iv);
  const tag = base64urlDecode(parsed.tag);
  const ct = base64urlDecode(parsed.ct);
  if (!salt || !iv || !tag || !ct) {
    throw new Error("Corrupt encrypted private key file");
  }
  const key = await deriveKey(passphrase, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const seed = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (seed.length !== 32) {
      throw new Error("bad length");
    }
    return new Uint8Array(seed);
  } catch {
    throw new Error("Cannot decrypt private key file (wrong passphrase or corrupt file)");
  }
}
