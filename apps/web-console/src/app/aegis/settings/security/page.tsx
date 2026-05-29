"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";

import settings from "../settings.module.css";

export default function SecuritySettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const changePassword = useMutation({
    mutationFn: () => {
      if (next !== confirm) {
        throw new Error("New passwords do not match");
      }
      return idApi<{ ok: boolean }>("/account/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
    },
    onSuccess: () => {
      setMessage("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: () => setMessage(null),
  });

  return (
    <section className={settings.settingCard}>
      <h2>Password</h2>
      <p>
        Change the password for your Salanor account. Passwords are stored with scrypt
        hashing.
      </p>
      <form
        className={settings.settingsForm}
        onSubmit={(e) => {
          e.preventDefault();
          changePassword.mutate();
        }}
      >
        <label className={ui.field}>
          <span>Current password</span>
          <input
            className={ui.input}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label className={ui.field}>
          <span>New password</span>
          <input
            className={ui.input}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className={ui.field}>
          <span>Confirm new password</span>
          <input
            className={ui.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {changePassword.isError ? (
          <ErrorAlert message={(changePassword.error as Error).message} />
        ) : null}
        {message && changePassword.isSuccess ? (
          <p className={ui.muted}>{message}</p>
        ) : null}
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={changePassword.isPending}
        >
          {changePassword.isPending ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
