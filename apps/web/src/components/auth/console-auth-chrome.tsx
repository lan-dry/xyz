import type { ReactNode } from "react";

/** Minimal chrome for console host sign-in — no marketing SiteHeader/Footer. */
export function ConsoleAuthChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fb]" data-console-auth-shell>
      <header className="border-b border-black/5 bg-white px-4 py-4">
        <p className="text-sm font-semibold tracking-tight text-ink">Aegis Console</p>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
