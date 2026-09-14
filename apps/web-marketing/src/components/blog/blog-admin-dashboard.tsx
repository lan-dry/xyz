"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { BlogPostListItem } from "@/lib/blog/types";
import { formatBlogDate } from "@/lib/blog/utils";

import { BlogAdminGate, blogAdminHeaders, useBlogAdminToken } from "./blog-admin-auth";
import styles from "./blog.module.css";

function Dashboard({ token }: { token: string }) {
  const { clearToken } = useBlogAdminToken();
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/blog/admin/posts?status=all", {
      headers: blogAdminHeaders(token),
    });
    if (res.status === 401) {
      clearToken();
      return;
    }
    const data = (await res.json()) as { posts: BlogPostListItem[] };
    setPosts(data.posts);
    setLoading(false);
  }, [token, clearToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.adminShell}>
      <div className={styles.adminInner}>
        <div className={styles.adminHeader}>
          <h1 className={styles.adminTitle}>Blog posts</h1>
          <div className={styles.adminActions}>
            <Link href="/blog" className={styles.btn}>
              View public blog
            </Link>
            <button type="button" className={styles.btn} onClick={clearToken}>
              Sign out
            </button>
            <Link href="/blog/admin/new" className={styles.btnPrimary}>
              New article
            </Link>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No posts yet.{" "}
            <Link href="/blog/admin/new" style={{ color: "var(--teal-bright)" }}>
              Write your first article
            </Link>
            .
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <strong>{post.title}</strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      /blog/{post.slug}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        post.status === "published" ? styles.statusPublished : styles.statusDraft
                      }
                    >
                      {post.status}
                    </span>
                  </td>
                  <td>{formatBlogDate(post.publishedAt ?? post.createdAt)}</td>
                  <td>
                    <Link href={`/blog/admin/edit/${post.id}`} className={styles.btn}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function BlogAdminDashboard() {
  return <BlogAdminGate>{(token) => <Dashboard token={token} />}</BlogAdminGate>;
}
