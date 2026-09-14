import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TotpChallengeForm } from "@/components/totp-challenge-form";
import { prisma } from "@/lib/prisma";
import { TOTP_CHALLENGE_COOKIE_NAME, validateTotpChallengeCookie } from "@/lib/totp/challenge-cookie";

export const metadata: Metadata = {
  title: "Verify sign-in",
};

type PageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function TotpSignInPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true },
  });
  const callbackUrl = (await searchParams).callbackUrl || "/app/console/aegis";

  if (!user?.totpEnabledAt) {
    redirect(callbackUrl);
  }

  const challengeCookie = (await cookies()).get(TOTP_CHALLENGE_COOKIE_NAME)?.value;
  if (await validateTotpChallengeCookie(challengeCookie, userId)) {
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold text-ink">Two-factor authentication</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">
        Enter the 6-digit code from your authenticator app to complete sign-in.
      </p>
      <div className="mt-8">
        <TotpChallengeForm callbackUrl={callbackUrl} />
      </div>
      <p className="mt-4 text-xs text-ink/60">
        Signed in as <span className="font-medium text-ink">{session.user?.email}</span>.{" "}
        <Link href="/sign-in" className="underline">
          Use a different account
        </Link>
        .
      </p>
    </div>
  );
}
