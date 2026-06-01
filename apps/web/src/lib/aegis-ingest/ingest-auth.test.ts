import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
}));

const { verifyApiKeySecret } = vi.hoisted(() => ({
  verifyApiKeySecret: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findMany, update },
  },
}));

vi.mock("@/lib/console/api-keys", () => ({
  verifyApiKeySecret,
}));

import { authorizeIngestRequest, extractIngestApiKey } from "./ingest-auth";

describe("ingest-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AEGIS_INGEST_DEV_KEY;
  });

  it("extracts api key from Bearer authorization", () => {
    const headers = new Headers({ authorization: "Bearer att_live_abc123" });
    expect(extractIngestApiKey(headers)).toBe("att_live_abc123");
  });

  it("authorizes hashed api key and updates last used timestamp", async () => {
    findMany.mockResolvedValue([
      { id: "k1", organizationId: "org-1", secretHash: "hash-1" },
      { id: "k2", organizationId: "org-2", secretHash: "hash-2" },
    ]);
    verifyApiKeySecret
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    update.mockResolvedValue({});

    const result = await authorizeIngestRequest(
      new Headers({ authorization: "Bearer att_live_real" }),
    );

    expect(result).toEqual({ ok: true, organizationId: "org-2", source: "api_key" });
    expect(verifyApiKeySecret).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: "k2" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("falls back to dev key when provided", async () => {
    findMany.mockResolvedValue([]);
    process.env.AEGIS_INGEST_DEV_KEY = "dev-secret";

    const result = await authorizeIngestRequest(
      new Headers({ "x-aegis-api-key": "dev-secret" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("dev_fallback");
    }
  });
});
