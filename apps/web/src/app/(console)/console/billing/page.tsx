import { BillingPanel } from "@/components/console/billing-panel";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { getProPriceId } from "@/lib/billing/stripe";
import { roleMeetsMinimum } from "@/lib/console/roles";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export default async function ConsoleBillingPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const organization = await prisma.organization.findUnique({
    where: { id: ctx.activeOrgId },
    select: {
      plan: true,
      billingStatus: true,
      stripeCustomerId: true,
    },
  });

  if (!organization) return null;

  return (
    <section className="space-y-6">
      <ConsolePageHeader title="Billing" subtitle="Organization-level billing controls for your Aegis plan." />
      <BillingPanel
        key={ctx.activeOrgId}
        canManageBilling={roleMeetsMinimum(ctx.membership.role, "admin")}
        checkoutEnabled={Boolean(getProPriceId())}
        initial={{
          plan: organization.plan || "starter",
          billingStatus: organization.billingStatus,
          hasCustomer: Boolean(organization.stripeCustomerId),
          usage: {
            eventsThisMonth: null,
            seats: null,
          },
        }}
      />
    </section>
  );
}
