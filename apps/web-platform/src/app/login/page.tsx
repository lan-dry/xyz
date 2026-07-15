"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import card from "@/components/ops-ui/setting-card.module.css";
import { ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { idApi } from "@/lib/id-api";
import {
  applyOpsTheme,
  persistOpsTheme,
  resolveOpsTheme,
  type OpsTheme,
} from "@/lib/ops-theme";
import { platformApi } from "@/lib/platform-api";
import { CONSOLE_URL } from "@/lib/urls";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("dev@salanor.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<OpsTheme>("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-console-app", "");
    const resolved = resolveOpsTheme();
    applyOpsTheme(resolved);
    setTheme(resolved);
    return () => document.documentElement.removeAttribute("data-console-app");
  }, []);

  function onThemeToggle() {
    const next: OpsTheme = theme === "dark" ? "light" : "dark";
    applyOpsTheme(next);
    persistOpsTheme(next);
    setTheme(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await platformApi("session");
      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(
        msg.includes("Forbidden")
          ? "This account is not authorized for Platform Ops."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-console-shell
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--console-bg)",
      }}
    >
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost}`}
          onClick={onThemeToggle}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
      <section className={card.settingCard} style={{ width: "100%", maxWidth: "22rem" }}>
        <h2>Platform Ops</h2>
        <p>
          Employees only. Customers use the{" "}
          <a href={CONSOLE_URL} className={ui.tableLink}>
            Aegis Console
          </a>
          .
        </p>
        <form className={ui.formGrid} onSubmit={onSubmit}>
          <label className={ui.field}>
            Email
            <input
              className={ui.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            Password
            <input
              className={ui.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <ErrorAlert message={error} /> : null}
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
