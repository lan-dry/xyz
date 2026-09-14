"use client";

import type { BlogPost } from "@/lib/blog/types";

import { BlogAdminGate } from "./blog-admin-auth";
import { BlogPostEditor } from "./blog-post-editor";

export function BlogAdminEditClient({ post }: { post: BlogPost }) {
  return <BlogAdminGate>{(token) => <BlogPostEditor token={token} initial={post} />}</BlogAdminGate>;
}
