"use client";

import { Calendar } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { ui } from "./console-ui";
import styles from "./date-input.module.css";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  className?: string;
};

/**
 * Native date input with a theme-aware calendar glyph.
 * Hides the browser’s own indicator (often invisible in dark mode).
 */
export function DateInput({ className, ...props }: DateInputProps) {
  return (
    <span className={styles.wrap}>
      <input
        type="date"
        className={`${ui.input} ${styles.input} ${className ?? ""}`}
        {...props}
      />
      <Calendar className={styles.icon} size={16} aria-hidden />
    </span>
  );
}
