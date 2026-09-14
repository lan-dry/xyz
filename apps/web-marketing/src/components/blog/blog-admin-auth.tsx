"use client";

import { useEffect, useState, type ReactNode } from "react";

import styles from "./blog.module.css";

const STORAGE_KEY = "salanor-blog-admin-token";

export function useBlogAdminToken() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  const saveToken = (value: string) => {
    sessionStorage.setItem(STORAGE_KEY, value);
    setToken(value);
  };

  const clearToken = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  };

  return { token, ready, saveToken, clearToken };
}

export function blogAdminHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function BlogAdminGate({ children }: { children: (token: string) => ReactNode }) {
  const { token, ready, saveToken } = useBlogAdminToken();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/blog/admin/posts?status=all", {
      headers: blogAdminHeaders(input.trim()),
    });
    if (!res.ok) {
      setError("Invalid admin key. Set BLOG_ADMIN_SECRET on the server and use that value.");
      return;
    }
    saveToken(input.trim());
  };

  if (!ready) return null;

  if (!token) {
    return (
      <div className={styles.adminShell}>
        <div className={styles.authCard}>
          <h1 className={styles.adminTitle}>Blog admin</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem", marginTop: 0 }}>
            Enter your publishing key to create and edit articles.
          </p>
          {error ? <div className={styles.messageError}>{error}</div> : null}
          <form onSubmit={submit}>
            <div className={styles.field}>
              <label htmlFor="blog-admin-key">Admin key</label>
              <input
                id="blog-admin-key"
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className={styles.btnPrimary}>
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children(token)}</>;
}
