"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { idApi } from "@/lib/id-api";
import type { ConsoleOrganization, MeResponse } from "@/lib/types";

import styles from "./org-display.module.css";

export function OrgDisplay({
  organization,
  organizations,
}: {
  organization: ConsoleOrganization;
  organizations: ConsoleOrganization[];
}) {
  const canSwitch = organizations.length > 1;
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!canSwitch) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [canSwitch]);

  async function switchOrg(orgId: string) {
    if (orgId === organization.organization_id || switching) return;
    setSwitching(true);
    setOpen(false);
    try {
      await idApi<MeResponse>("/orgs/switch", {
        method: "POST",
        body: JSON.stringify({ organization_id: orgId }),
      });
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Building2 size={16} className={styles.icon} aria-hidden />
      <span className={styles.label}>Organization</span>
      <div className={styles.relative} ref={rootRef}>
        <button
          type="button"
          className={`${styles.orgBtn} ${canSwitch ? styles.orgBtnInteractive : ""}`}
          onClick={() => canSwitch && setOpen((v) => !v)}
          aria-expanded={canSwitch ? open : undefined}
          aria-haspopup={canSwitch ? "listbox" : undefined}
          disabled={!canSwitch || switching}
          title={canSwitch ? "Switch organization" : organization.name}
        >
          <span className={styles.orgName}>
            {switching ? "Switching…" : organization.name}
          </span>
          {canSwitch ? <ChevronDown size={14} aria-hidden /> : null}
        </button>
        {canSwitch && open ? (
          <div className={styles.menu} role="listbox" aria-label="Organizations">
            {organizations.map((org) => (
              <button
                key={org.organization_id}
                type="button"
                role="option"
                aria-selected={org.organization_id === organization.organization_id}
                className={`${styles.menuItem} ${
                  org.organization_id === organization.organization_id
                    ? styles.menuItemActive
                    : ""
                }`}
                onClick={() => switchOrg(org.organization_id)}
              >
                <span>
                  {org.name}
                  <span className={styles.orgSlug}> · {org.slug}</span>
                </span>
                {org.organization_id === organization.organization_id ? (
                  <Check size={14} aria-hidden />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className={styles.orgSlug}>{organization.slug}</span>
      <span className={styles.hint}>· APS-1 ledger</span>
    </div>
  );
}
