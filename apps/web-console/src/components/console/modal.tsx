"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { ui } from "./console-ui";
import styles from "./modal.module.css";

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  wide,
  closeOnOverlayClick = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** When false, only Cancel / X close the dialog (Resend-style). */
  closeOnOverlayClick?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`${styles.dialog} ${wide ? styles.dialogWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="modal-title" className={styles.title}>
              {title}
            </h2>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost} ${styles.close}`}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}
