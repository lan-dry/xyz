"use client";

import { useEffect } from "react";

import { applyOpsTheme, resolveOpsTheme } from "@/lib/ops-theme";

export function OpsThemeInit() {
  useEffect(() => {
    document.documentElement.setAttribute("data-console-app", "");
    applyOpsTheme(resolveOpsTheme());
    return () => {
      document.documentElement.removeAttribute("data-console-app");
    };
  }, []);

  return null;
}
