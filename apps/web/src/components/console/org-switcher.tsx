"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import { CreateOrganizationForm } from "@/components/console/create-organization-form";

type OrgOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export function OrgSwitcher({
  organizations,
  activeOrgId,
  collapsed = false,
}: {
  organizations: OrgOption[];
  activeOrgId: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeOrg = organizations.find((org) => org.id === activeOrgId) ?? organizations[0];
  const initials = useMemo(() => {
    if (!activeOrg?.name) return "O";
    return activeOrg.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [activeOrg?.name]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [createOpen]);

  function switchOrganization(organizationId: string) {
    if (organizationId === activeOrgId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      const res = await fetch("/api/console/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) return;
      router.refresh();
    });
  }

  function openCreateModal() {
    setOpen(false);
    setCreateOpen(true);
  }

  function closeCreateModal() {
    setCreateOpen(false);
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={pending}
        className={`flex w-full items-center rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-gray-50 ${
          collapsed ? "justify-center" : "gap-2"
        }`.trim()}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-soft/55 text-xs font-semibold text-teal-deep">
          {initials}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium tracking-tight text-gray-800">{activeOrg?.name}</span>
              <span className="block truncate text-xs text-gray-500">{activeOrg?.role}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className={`z-20 rounded-lg border border-gray-200 bg-white p-1 shadow-lg ${collapsed ? "absolute left-full top-0 ml-2 w-64" : "absolute left-0 right-0 top-11"}`}
        >
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => switchOrganization(org.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors duration-150 hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-700">
                {org.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate tracking-tight text-gray-800">{org.name}</span>
                <span className="block truncate text-xs text-gray-500">{org.role}</span>
              </span>
              {org.id === activeOrgId ? <Check className="h-4 w-4 text-gray-700" /> : null}
            </button>
          ))}
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-1 inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            Create organization
          </button>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold tracking-tight text-gray-900">Create organization</h3>
            <p className="mt-1 text-sm text-gray-500">You become the owner and can invite members afterward.</p>
            <div className="mt-4">
              <CreateOrganizationForm variant="modal" onSuccess={closeCreateModal} onCancel={closeCreateModal} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
