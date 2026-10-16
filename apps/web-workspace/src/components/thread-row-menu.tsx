"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./thread-row-menu.module.css";

const MENU_WIDTH = 180;

export function ThreadRowMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = () => setPos(null);
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setPos({
      top: Math.min(rect.bottom + 6, window.innerHeight - 110),
      left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
    });
  }

  function run(action: () => void) {
    setPos(null);
    action();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {pos ? (
        <div
          ref={menuRef}
          role="menu"
          className={styles.menu}
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
        >
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => run(onRename)}
          >
            <Pencil size={15} aria-hidden />
            Rename
          </button>
          <div className={styles.separator} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles.danger}`}
            onClick={() => run(onDelete)}
          >
            <Trash2 size={15} aria-hidden />
            Delete
          </button>
        </div>
      ) : null}
    </>
  );
}
