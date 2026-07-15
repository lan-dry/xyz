import Link from "next/link";

import { ConsolePageHeader } from "@/components/console/console-page-header";
import { CreateOrganizationForm } from "@/components/console/create-organization-form";
import { consoleAegisPath } from "@/lib/app-paths";

export default function ConsoleCreateOrganizationPage() {
  return (
    <section className="max-w-2xl space-y-6">
      <ConsolePageHeader
        title="Create organization"
        subtitle="Create a new Aegis organization. You become the owner and can invite other members afterward."
      />

      <div className="mt-6">
        <CreateOrganizationForm />
      </div>

      <p className="mt-4 text-sm text-ink/70">
        Need a local sandbox quickly? <code className="text-xs">AEGIS_CONSOLE_AUTO_PROVISION=1</code> still seeds the dev
        organization for first-time local sign-ins.
      </p>

      <Link
        className="inline-flex rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
        href={consoleAegisPath()}
      >
        Back to console home
      </Link>
    </section>
  );
}
