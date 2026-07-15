import {
  ADMIN_ALLOWLIST_DENIED_MESSAGE,
  getOAuthProviderIds,
  isAllowedAdminEmail,
  PLATFORM_SUSPENDED_MESSAGE,
} from "@salanor/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { normalizeLoopbackCallbackUrl } from "@salanor/auth/auth-request-origin";

import { auth } from "@/auth";
import { SignInForm } from "@/components/sign-in-form";
import { prisma } from "@/lib/prisma";
import { CONSOLE_AEGIS_BASE } from "@/lib/app-paths";
import { isAppPublicHost } from "@/lib/public-hosts";

function signInErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "Suspended") return PLATFORM_SUSPENDED_MESSAGE;
  if (error === "AccessDenied") return ADMIN_ALLOWLIST_DENIED_MESSAGE;
  if (error === "Configuration") {
    return "Sign-in is misconfigured. Check AUTH_SECRET, AUTH_URL, and email/OAuth settings in .env.";
  }
  return "Sign-in failed. Try again or contact your administrator.";
}

export const metadata: Metadata = {
  title: "Sign in",
};

type PageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

async function defaultCallbackUrl(email: string | null | undefined): Promise<string> {
  if (await isAllowedAdminEmail(email, prisma)) return "/admin";
  return CONSOLE_AEGIS_BASE;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;
  const host = (await headers()).get("host");
  const isConsole = isAppPublicHost(host);
  const rawCallback = params.callbackUrl ?? (await defaultCallbackUrl(session?.user?.email));
  const callbackUrl = normalizeLoopbackCallbackUrl(rawCallback, host);

  if (session) {
    redirect(callbackUrl);
  }
  const errorMessage = signInErrorMessage(params.error);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold text-ink">Sign in</h1>
      {isConsole ? (
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          Sign in to the Aegis tenant console. Access is granted through organization membership or a pending
          invite.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          Salanor admin (<code className="text-xs">/admin</code>) requires a row in{" "}
          <code className="text-xs">sal_internal_users</code> with role <code className="text-xs">superadmin</code>,{" "}
          <code className="text-xs">eng</code>, or <code className="text-xs">support</code>. Aegis console (
          <code className="text-xs">{CONSOLE_AEGIS_BASE}</code>) uses organization membership and RBAC.
        </p>
      )}
      {errorMessage ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <SignInForm callbackUrl={callbackUrl} oauthProviders={getOAuthProviderIds()} className="mt-8" />
    </div>
  );
}
