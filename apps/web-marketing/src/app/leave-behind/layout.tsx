import type { ReactNode } from "react";

import "./leave-behind-print.css";

/** Print-friendly leave-behind: site chrome hidden via leave-behind-print.css. */
export default function LeaveBehindLayout({ children }: { children: ReactNode }) {
  return children;
}
