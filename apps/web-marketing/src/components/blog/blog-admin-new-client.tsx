"use client";

import { BlogAdminGate } from "./blog-admin-auth";
import { BlogPostEditor } from "./blog-post-editor";

export function BlogAdminNewClient() {
  return <BlogAdminGate>{(token) => <BlogPostEditor token={token} />}</BlogAdminGate>;
}
