"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ErrorAlert, LoadingBlock, ui } from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import { formatRelativeTime } from "@/lib/relative-time";

import settings from "../settings.module.css";

type LoginEvent = {
  event_id: string;
  method: string;
  success: boolean;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  created_at: string;
};

function methodLabel(method: string): string {
  switch (method) {
    case "password":
      return "Email & password";
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "sso":
      return "Enterprise SSO";
    default:
      return method;
  }
}

export default function SecuritySettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const loginEventsQuery = useQuery({
    queryKey: ["id", "login-events"],
    queryFn: () => idApi<{ events: LoginEvent[] }>("/account/login-events"),
  });

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
      void loginEventsQuery.refetch();
    },
    onError: () => setMessage(null),
  });

  const events = loginEventsQuery.data?.events ?? [];

  return (
    <>
      <section className={settings.settingCard}>
        <h2>Recent sign-ins</h2>
        <p>
          Sign-in attempts on your Salanor account across organizations. Review unfamiliar IP
          addresses or devices and rotate your password if something looks wrong.
        </p>
        {loginEventsQuery.isPending ? <LoadingBlock /> : null}
        {loginEventsQuery.isError ? (
          <ErrorAlert message={(loginEventsQuery.error as Error).message} />
        ) : null}
        {!loginEventsQuery.isPending && events.length === 0 ? (
          <p className={ui.muted}>No sign-in history recorded yet.</p>
        ) : null}
        {events.length > 0 ? (
          <div className={ui.tableWrap} style={{ marginTop: "1rem" }}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Method</th>
                  <th>Result</th>
                  <th>IP address</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id}>
                    <td>{formatRelativeTime(e.created_at)}</td>
                    <td>{methodLabel(e.method)}</td>
                    <td>
                      {e.success ? (
                        <span>Success</span>
                      ) : (
                        <span className={ui.tableMuted}>
                          Failed{e.failure_reason ? ` (${e.failure_reason})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="mono">{e.ip_address ?? "—"}</td>
                    <td>{e.device ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
          City and country are not shown yet. We store IP and browser user-agent for your review.
        </p>
      </section>

      <section className={settings.settingCard}>
        <h2>Password</h2>
        <p>
          Change the password for your Salanor account. Passwords are stored with scrypt hashing.
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
              minLength={10}
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
              minLength={10}
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
    </>
  );
}
