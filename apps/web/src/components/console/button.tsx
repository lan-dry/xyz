"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

import { consoleInkCtaClass } from "./console-cta";

function resolveVariant(variant: ButtonVariant): string {
  if (variant === "primary") {
    return `rounded-full ${consoleInkCtaClass}`;
  }
  if (variant === "secondary") {
    return "rounded-lg border border-[var(--console-border)] bg-[var(--console-surface)] text-[var(--console-fg)] hover:bg-[var(--console-surface-hover)]";
  }
  return "rounded-lg text-[var(--console-fg-subtle)] hover:bg-[var(--console-surface-hover)] hover:text-[var(--console-fg)]";
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; children: ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center px-3.5 text-sm font-medium tracking-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${resolveVariant(
        variant,
      )} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
