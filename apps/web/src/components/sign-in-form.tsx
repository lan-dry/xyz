"use client";

import { ADMIN_ALLOWLIST_DENIED_MESSAGE, type SalanorOAuthProviderId } from "@salanor/auth";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

type SignInFormProps = {
  callbackUrl: string;
  oauthProviders?: SalanorOAuthProviderId[];
  className?: string;
};

const OAUTH_LABELS: Record<SalanorOAuthProviderId, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

export function SignInForm({
  callbackUrl,
  oauthProviders = [],
  className,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<SalanorOAuthProviderId | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onOAuth(provider: SalanorOAuthProviderId) {
    setOauthPending(provider);
    setError(null);
    await signIn(provider, { callbackUrl });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const trimmed = email.trim();

    try {
      const check = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (check.ok) {
        const { allowed } = (await check.json()) as { allowed?: boolean };
        if (allowed === false) {
          setError(ADMIN_ALLOWLIST_DENIED_MESSAGE);
          setPending(false);
          return;
        }
      }
    } catch {
      // If the check endpoint fails, continue — Auth.js signIn callback is the source of truth.
    }

    const result = await signIn("nodemailer", {
      email: trimmed,
      redirect: false,
      callbackUrl,
    });
    setPending(false);
    if (result?.error) {
      setError(
        result.error === "AccessDenied"
          ? ADMIN_ALLOWLIST_DENIED_MESSAGE
          : "Could not send the sign-in link. Check your email and server configuration.",
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className={className}>
        Check your inbox for a sign-in link. Open it in the <strong>same browser</strong> where you
        requested it (different browser or email app = no session). In dev, the full link is also
        printed in the terminal as <code className="text-xs">[auth] magic link for …</code>.
      </p>
    );
  }

  return (
    <div className={className}>
      {oauthProviders.length > 0 ? (
        <div className="space-y-3">
          {oauthProviders.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={oauthPending !== null || pending}
              onClick={() => onOAuth(provider)}
              className="w-full rounded border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-black/[0.03] disabled:opacity-60"
            >
              {oauthPending === provider ? "Redirecting…" : OAUTH_LABELS[provider]}
            </button>
          ))}
          <p className="text-xs leading-relaxed text-ink/60">
            OAuth uses the email on your Google/GitHub account. It must match{" "}
            <code className="text-[0.7rem]">sal_internal_users</code> (or dev{" "}
            <code className="text-[0.7rem]">ADMIN_EMAILS</code> bootstrap).
          </p>
          <div className="flex items-center gap-3 py-2">
            <span className="h-px flex-1 bg-black/10" aria-hidden />
            <span className="text-xs text-ink/60">or email a magic link</span>
            <span className="h-px flex-1 bg-black/10" aria-hidden />
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-black/15 bg-white px-3 py-2 text-ink"
          placeholder="you@salanor.com"
        />
        {error ? (
          <p className="mt-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || oauthPending !== null}
          className="mt-4 w-full rounded bg-teal px-4 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Email magic link"}
        </button>
      </form>
    </div>
  );
}
