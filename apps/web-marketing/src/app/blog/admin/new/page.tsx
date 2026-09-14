import type { Metadata } from "next";

import { BlogAdminNewClient } from "@/components/blog/blog-admin-new-client";

export const metadata: Metadata = {
  title: "New article",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function BlogAdminNewPage() {
  return <BlogAdminNewClient />;
}
