import { describe, expect, it, vi } from "vitest";

import { S3BlobStore } from "./s3";

function mockClient(handlers: {
  put?: (input: { Key: string; Body: Buffer }) => void;
  get?: (input: { Key: string }) => Buffer | null;
  head?: (input: { Key: string }) => boolean;
}) {
  return {
    send: vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        handlers.put?.({
          Key: command.input.Key as string,
          Body: command.input.Body as Buffer,
        });
        return {};
      }
      if (name === "GetObjectCommand") {
        const key = command.input.Key as string;
        const buf = handlers.get?.({ Key: key });
        if (!buf) {
          const err = new Error("NoSuchKey");
          (err as { name: string }).name = "NoSuchKey";
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => Uint8Array.from(buf),
          },
        };
      }
      if (name === "HeadObjectCommand") {
        const ok = handlers.head?.({ Key: command.input.Key as string }) ?? false;
        if (!ok) {
          const err = new Error("NotFound");
          (err as { name: string }).name = "NotFound";
          throw err;
        }
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    }),
  };
}

describe("S3BlobStore", () => {
  it("puts and gets via mocked S3 client", async () => {
    const store = new Map<string, Buffer>();
    const client = mockClient({
      put: ({ Key, Body }) => store.set(Key, Body),
      get: ({ Key }) => store.get(Key) ?? null,
      head: ({ Key }) => store.has(Key),
    });

    const blob = new S3BlobStore({
      bucket: "aegis",
      accessKeyId: "key",
      secretAccessKey: "secret",
      client: client as never,
    });

    await blob.put("ots/abc.ots", Buffer.from("proof"));
    expect(await blob.has("ots/abc.ots")).toBe(true);
    expect((await blob.get("ots/abc.ots"))?.toString()).toBe("proof");
    expect(await blob.get("missing")).toBeNull();
  });
});
