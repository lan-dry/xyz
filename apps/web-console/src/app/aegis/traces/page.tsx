"use client";

import { CaseListView } from "@/components/console/case-list-view";

/** Browsable cases list (separate from Live feed streaming view). */
export default function CasesPage() {
  return <CaseListView variant="cases" />;
}
