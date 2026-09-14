import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogAdminEditClient } from "@/components/blog/blog-admin-edit-client";
import { getBlogPostById } from "@/lib/blog/store";

export const metadata: Metadata = {
  title: "Edit article",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BlogAdminEditPage({ params }: Props) {
  const { id } = await params;
  const post = await getBlogPostById(id);
  if (!post) notFound();

  return <BlogAdminEditClient post={post} />;
}
