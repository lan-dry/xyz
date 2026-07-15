import { createElement, type ReactNode } from "react";

import { CircleDashed } from "lucide-react";

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return createElement(
    "div",
    { className: "rounded-xl border border-gray-200 bg-white px-8 py-12 text-center" },
    createElement(
      "div",
      {
        className:
          "mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-soft/70 bg-gradient-to-b from-white to-teal-soft/25 text-teal",
      },
      createElement(CircleDashed, { className: "h-6 w-6" }),
    ),
    createElement("h3", { className: "text-lg font-semibold tracking-tight text-ink" }, title),
    createElement("p", { className: "mx-auto mt-2 max-w-md text-sm text-gray-500" }, description),
    action ? createElement("div", { className: "mt-6 flex justify-center" }, action) : null,
  );
}
