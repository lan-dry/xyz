import { ApiKeysPanel } from "@/components/console/api-keys-panel";
import { CreateApiKeyButton } from "@/components/console/create-api-key-button";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { roleMeetsMinimum } from "@/lib/console/roles";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export default async function ConsoleApiKeysPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: ctx.activeOrgId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  const canManage = roleMeetsMinimum(ctx.membership.role, "developer");

  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="API keys"
        subtitle="Secrets are shown once at creation; only prefixes are stored in listings."
        actions={
          canManage ? <CreateApiKeyButton /> : undefined
        }
      />
      <div className="mt-6">
        <ApiKeysPanel
          key={ctx.activeOrgId}
          canManage={canManage}
          initialKeys={keys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </section>
  );
}
