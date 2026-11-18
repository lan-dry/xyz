import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair } from "@salanor/aegis-sdk";
import { readPrivateKey, writePrivateKey } from "../src/keystore.js";

const posix = process.platform !== "win32";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aegis-keystore-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("keystore", () => {
  it("roundtrips an unencrypted key and writes mode 0600", async () => {
    const keys = await generateKeyPair();
    const path = join(dir, "k.key");
    await writePrivateKey(path, keys.privateKey);
    if (posix) {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(Buffer.from(await readPrivateKey(path))).toEqual(Buffer.from(keys.privateKey));
  });

  it("roundtrips an encrypted key; wrong or missing passphrase fails; plaintext is not on disk", async () => {
    const keys = await generateKeyPair();
    const path = join(dir, "k.enc.key");
    await writePrivateKey(path, keys.privateKey, { passphrase: "correct horse" });
    const text = await readFile(path, "utf8");
    expect(text).not.toContain(keys.privateKeyB64);
    expect(Buffer.from(await readPrivateKey(path, "correct horse"))).toEqual(Buffer.from(keys.privateKey));
    await expect(readPrivateKey(path, "wrong")).rejects.toThrow(/decrypt/);
    await expect(readPrivateKey(path)).rejects.toThrow(/encrypted/);
  });

  it("refuses to overwrite without force", async () => {
    const keys = await generateKeyPair();
    const path = join(dir, "k.key");
    await writePrivateKey(path, keys.privateKey);
    await expect(writePrivateKey(path, keys.privateKey)).rejects.toThrow();
    await writePrivateKey(path, (await generateKeyPair()).privateKey, { force: true });
  });

  it.skipIf(!posix)("refuses a key file readable by group/others", async () => {
    const keys = await generateKeyPair();
    const path = join(dir, "k.key");
    await writePrivateKey(path, keys.privateKey);
    await chmod(path, 0o644);
    await expect(readPrivateKey(path)).rejects.toThrow(/chmod 600/);
  });

  it("rejects garbage files", async () => {
    const path = join(dir, "bad.key");
    await writeFile(path, "not json", { mode: 0o600 });
    await expect(readPrivateKey(path)).rejects.toThrow(/parse/);
  });
});
