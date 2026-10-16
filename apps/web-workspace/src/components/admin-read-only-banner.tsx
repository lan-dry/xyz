"use client";

import ui from "@/components/admin-ui.module.css";

export function AdminReadOnlyBanner(props: {
  readOnly: boolean;
  siteManagerOnly?: boolean;
}) {
  if (!props.readOnly && !props.siteManagerOnly) {
    return null;
  }
  return (
    <p className={ui.notice}>
      {props.siteManagerOnly
        ? "You manage the sites assigned to you."
        : "View-only access."}
    </p>
  );
}
