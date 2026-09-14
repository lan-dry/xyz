import { prisma } from "@/lib/prisma";
import { verifyApiKeySecret } from "@/lib/console/api-keys";
import { resolveDevOrganizationId } from "@/lib/console/dev-org";

export type IngestAuthSuccess = {
  ok: true;
  organizationId: string;
  source: "api_key" | "dev_fallback";
};

export type IngestAuthFailure = {
  ok: false;
  status: 401;
  message: string;
};

export type IngestAuthResult = IngestAuthSuccess | IngestAuthFailure;

export function extractIngestApiKey(headers: Headers): string | null {
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const token = bearer.slice("Bearer ".length).trim();
    return token || null;
  }
  const direct = headers.get("x-aegis-api-key")?.trim();
  return direct || null;
}

export async function authorizeIngestRequest(headers: Headers): Promise<IngestAuthResult> {
  const provided = extractIngestApiKey(headers);
  if (!provided) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized. Provide Bearer <api-key> or X-Aegis-Api-Key.",
    };
  }

  const keys = await prisma.apiKey.findMany({
    where: { revokedAt: null },
    select: {
      id: true,
      organizationId: true,
      secretHash: true,
    },
    orderBy: { createdAt: "desc" },
  });

  for (const key of keys) {
    if (!(await verifyApiKeySecret(provided, key.secretHash))) {
      continue;
    }
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return { ok: true, organizationId: key.organizationId, source: "api_key" };
  }

  const devKey = process.env.AEGIS_INGEST_DEV_KEY?.trim();
  if (devKey && provided === devKey) {
    return { ok: true, organizationId: resolveDevOrganizationId(), source: "dev_fallback" };
  }

  return {
    ok: false,
    status: 401,
    message: "Unauthorized. Invalid ingest API key.",
  };
}
