import type { Metadata } from "next";

import { BlogAdminDashboard } from "@/components/blog/blog-admin-dashboard";

export const metadata: Metadata = {
  title: "Blog admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function BlogAdminPage() {
  return <BlogAdminDashboard />;
}
