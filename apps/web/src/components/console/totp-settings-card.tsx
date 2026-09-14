"use client";

import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/console/button";
import { formatDateTime } from "@/lib/format-datetime";

type TotpSettingsCardProps = {
  enabled: boolean;
  enabledAtIso: string | null;
};

type SetupResponse = {
  manualKey: string;
  otpauthUrl: string;
  qrDataUrl: string;
};

export function TotpSettingsCard({ enabled, enabledAtIso }: TotpSettingsCardProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [enabledAt, setEnabledAt] = useState(enabledAtIso);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [helpPinned, setHelpPinned] = useState(false);
  const [helpHovered, setHelpHovered] = useState(false);
  const helpVisible = helpPinned || helpHovered;

  async function beginSetup() {
    setPending(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/console/totp/setup", { method: "POST" });
    const payload = (await response.json().catch(() => null)) as SetupResponse & { error?: string } | null;
    setPending(false);
    if (!response.ok || !payload) {
      setError(payload?.error ?? "Could not start 2FA setup.");
      return;
    }
    setSetup(payload);
  }

  async function verifySetup() {
    setPending(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/console/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(payload?.error ?? "Could not verify 2FA code.");
      return;
    }
    setIsEnabled(true);
    const now = new Date().toISOString();
    setEnabledAt(now);
    setSetup(null);
    setCode("");
    setNotice("Two-factor authentication is enabled.");
  }

  async function disableTotp() {
    setPending(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/console/totp/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: disableCode.trim() }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(payload?.error ?? "Could not disable 2FA.");
      return;
    }
    setIsEnabled(false);
    setEnabledAt(null);
    setDisableCode("");
    setSetup(null);
    setNotice("Two-factor authentication is disabled.");
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5">
      <div
        className="relative"
        onMouseEnter={() => setHelpHovered(true)}
        onMouseLeave={() => setHelpHovered(false)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Security</h3>
          <button
            type="button"
            aria-label="What is TOTP 2FA?"
            aria-expanded={helpVisible}
            aria-controls="totp-help-panel"
            onClick={() => setHelpPinned((current) => !current)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/20 text-[11px] font-semibold text-ink transition-colors duration-150 hover:bg-black/[0.05]"
          >
            i
          </button>
        </div>
        {helpVisible ? (
          <div
            id="totp-help-panel"
            role="note"
            className="mt-3 rounded border border-teal/20 bg-teal/5 p-3 text-xs leading-relaxed text-ink/80"
          >
            <p>
              2FA adds a second check after email magic link or OAuth. Use an authenticator app like Google
              Authenticator, Authy, or 1Password.
            </p>
            <p className="mt-2">Setup: scan QR, enter the 6-digit code, then future sign-ins ask for a code.</p>
            <p className="mt-2">It is optional, and you can disable it later with a current code.</p>
          </div>
        ) : null}
      </div>
      {!isEnabled ? (
        <>
          <p className="mt-2 text-sm text-ink/80">
            Add an authenticator app for optional TOTP 2FA. After enabling, sign-in requires a 6-digit code.
          </p>
          {setup ? (
            <div className="mt-4 space-y-3 rounded-xl border border-black/10 bg-black/[0.02] p-4">
              <p className="text-sm text-ink/80">Scan this QR in your authenticator app, then confirm with a code.</p>
              <Image
                src={setup.qrDataUrl}
                alt="TOTP enrollment QR code"
                width={176}
                height={176}
                unoptimized
                className="rounded border border-black/10 bg-white p-1"
              />
              <p className="text-xs text-ink/70">
                Can&apos;t scan? Enter key manually: <code className="text-[0.7rem]">{setup.manualKey}</code>
              </p>
              <label className="block">
                <span className="text-sm text-ink">Verification code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                />
              </label>
              <Button
                type="button"
                onClick={verifySetup}
                disabled={pending || code.length !== 6}
                variant="secondary"
              >
                {pending ? "Verifying…" : "Confirm and enable"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={beginSetup}
              disabled={pending}
              variant="secondary"
              className="mt-3"
            >
              {pending ? "Preparing…" : "Enable 2FA"}
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink/80">
            2FA is on{enabledAt ? ` since ${formatDateTime(enabledAt)}` : ""}.
          </p>
          <p className="mt-2 text-xs text-ink/60">Disable requires a current TOTP code from your authenticator app.</p>
          <label className="mt-3 block">
            <span className="text-sm text-ink">Current code</span>
            <input
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-ink focus:border-teal focus:outline-none"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
            />
          </label>
          <Button
            type="button"
            onClick={disableTotp}
            disabled={pending || disableCode.length !== 6}
            variant="secondary"
            className="mt-3 border-red-300 text-red-900 hover:bg-red-50"
          >
            {pending ? "Disabling…" : "Disable 2FA"}
          </Button>
        </>
      )}
      {error ? (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-sm text-ink/80">{notice}</p> : null}
    </div>
  );
}
