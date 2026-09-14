import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { InviteAcceptPanel } from "@/components/console/invite-accept-panel";
import { hashInviteToken, isValidInviteToken, normalizeInviteEmail } from "@/lib/console/invites";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InviteAcceptPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim();
  const callbackUrl = token ? `/invite/accept?token=${encodeURIComponent(token)}` : "/invite/accept";

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (!isValidInviteToken(token)) {
    return (
      <section className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold text-ink">Invite link invalid</h1>
        <p className="mt-3 text-sm text-ink/80">This invite link is malformed. Ask your org admin for a new invite.</p>
      </section>
    );
  }

  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return (
      <section className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold text-ink">Invite unavailable</h1>
        <p className="mt-3 text-sm text-ink/80">
          This invite was revoked, already accepted, or expired. Ask your org admin to create a new invite.
        </p>
      </section>
    );
  }

  return (
    <InviteAcceptPanel
      token={token}
      inviteEmail={invite.email}
      signedInEmail={normalizeInviteEmail(session.user.email)}
      orgName={invite.organization.name}
      role={invite.role}
      expiresAtIso={invite.expiresAt.toISOString()}
    />
  );
}
