"use client";

import { useFormStatus } from "react-dom";

import { ui } from "@/components/ops-ui/ops-ui";

type Props = {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "danger";
};

export function CmsFormSubmit({ label, pendingLabel, variant = "primary" }: Props) {
  const { pending } = useFormStatus();
  const variantClass = variant === "danger" ? ui.btnDanger : ui.btnPrimary;

  return (
    <button type="submit" disabled={pending} className={`${ui.btn} ${variantClass}`} aria-busy={pending}>
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
