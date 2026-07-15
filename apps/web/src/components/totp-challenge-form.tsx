"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type TotpChallengeFormProps = {
  callbackUrl: string;
};

export function TotpChallengeForm({ callbackUrl }: TotpChallengeFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), callbackUrl }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not verify your authentication code.");
      setPending(false);
      return;
    }

    const data = (await response.json()) as { callbackUrl?: string };
    router.push(data.callbackUrl || callbackUrl || "/app/console/aegis");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label htmlFor="totp-code" className="block text-sm font-medium text-ink">
        6-digit code
      </label>
      <input
        id="totp-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full rounded border border-black/15 bg-white px-3 py-2 text-ink"
        placeholder="123456"
      />
      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-teal px-4 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify code"}
      </button>
    </form>
  );
}
