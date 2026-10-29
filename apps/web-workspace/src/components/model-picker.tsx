"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { StoaModel } from "@/lib/stoa-client";

import styles from "./model-picker.module.css";

export function ModelPicker({
  models,
  value,
  disabled,
  onChange,
}: {
  models: StoaModel[];
  value: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = models.find((m) => m.id === value) ?? models[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (models.length === 0 || !selected) {
    return null;
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>{selected.label}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          className={styles.menu}
          role="listbox"
          aria-label="Model"
        >
          {models.map((m) => {
            const isActive = m.id === selected.id;
            return (
              <li key={m.id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={isActive ? styles.optionActive : styles.option}
                  onClick={() => {
                    setOpen(false);
                    if (m.id !== value) {
                      onChange(m.id);
                    }
                  }}
                >
                  <span>{m.label}</span>
                  {isActive ? <Check size={14} aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
