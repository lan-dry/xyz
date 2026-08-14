import type { ReactNode } from "react";

/** Print-friendly leave-behind: no site header/footer. */
export default function LeaveBehindLayout({ children }: { children: ReactNode }) {
  return children;
}
