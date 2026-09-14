"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { BlogPost, BlogPostInput, BlogPostStatus } from "@/lib/blog/types";
import { slugify } from "@/lib/blog/utils";

import { BlogEditor } from "./blog-editor";
import { blogAdminHeaders } from "./blog-admin-auth";
import styles from "./blog.module.css";

type Props = {
  token: string;
  initial?: BlogPost;
};

const EMPTY: BlogPostInput = {
  title: "",
  excerpt: "",
  contentHtml: "<p></p>",
  coverImageUrl: "",
  authorName: "Landry Bougang",
  authorRole: "Founder, Salanor",
  tags: [],
  status: "draft",
  seoTitle: "",
  seoDescription: "",
};

export function BlogPostEditor({ token, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<BlogPostInput>(() =>
    initial
      ? {
          title: initial.title,
          excerpt: initial.excerpt,
          contentHtml: initial.contentHtml,
          coverImageUrl: initial.coverImageUrl ?? "",
          authorName: initial.authorName,
          authorRole: initial.authorRole ?? "",
          tags: initial.tags,
          status: initial.status,
          slug: initial.slug,
          seoTitle: initial.seoTitle ?? "",
          seoDescription: initial.seoDescription ?? "",
        }
      : EMPTY,
  );
  const [slugEdited, setSlugEdited] = useState(Boolean(initial?.slug));
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null,
  );

  const slugPreview = useMemo(() => {
    if (slugEdited && form.slug) return form.slug;
    return slugify(form.title || "untitled");
  }, [form.slug, form.title, slugEdited]);

  const update = <K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (statusOverride?: BlogPostStatus) => {
    setSaving(true);
    setMessage(null);
    const payload: BlogPostInput = {
      ...form,
      slug: slugPreview,
      status: statusOverride ?? form.status,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      coverImageUrl: form.coverImageUrl?.trim() || null,
      seoTitle: form.seoTitle?.trim() || null,
      seoDescription: form.seoDescription?.trim() || null,
    };

    const url = initial
      ? `/api/blog/admin/posts/${initial.id}`
      : "/api/blog/admin/posts";
    const method = initial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: blogAdminHeaders(token),
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage({ type: "error", text: data.error ?? "Save failed" });
      return;
    }

    const data = (await res.json()) as { post: BlogPost };
    setMessage({ type: "success", text: "Saved" });
    if (!initial) {
      router.push(`/blog/admin/edit/${data.post.id}`);
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (!window.confirm("Delete this post permanently?")) return;
    setSaving(true);
    const res = await fetch(`/api/blog/admin/posts/${initial.id}`, {
      method: "DELETE",
      headers: blogAdminHeaders(token),
    });
    setSaving(false);
    if (res.ok) router.push("/blog/admin");
  };

  return (
    <div className={`${styles.adminShell} ${styles.adminWide}`}>
      <div className={`${styles.adminInner} ${styles.adminWide}`}>
        <div className={styles.adminHeader}>
          <div>
            <Link href="/blog/admin" className={styles.backLink}>
              ← All posts
            </Link>
            <h1 className={styles.adminTitle}>{initial ? "Edit article" : "New article"}</h1>
          </div>
          <div className={styles.adminActions}>
            {initial?.status === "published" ? (
              <Link href={`/blog/${initial.slug}`} className={styles.btn} target="_blank">
                View live
              </Link>
            ) : null}
            <button
              type="button"
              className={styles.btn}
              disabled={saving}
              onClick={() => save("draft")}
            >
              Save draft
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={saving}
              onClick={() => save("published")}
            >
              {form.status === "published" ? "Update published" : "Publish"}
            </button>
            {initial ? (
              <button type="button" className={styles.btnDanger} disabled={saving} onClick={remove}>
                Delete
              </button>
            ) : null}
          </div>
        </div>

        {message ? (
          <div className={message.type === "error" ? styles.messageError : styles.messageSuccess}>
            {message.text}
          </div>
        ) : null}

        <div className={styles.editorLayout}>
          <div>
            <div className={styles.field}>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Article title"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="excerpt">Excerpt</label>
              <textarea
                id="excerpt"
                value={form.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
                placeholder="Short summary for cards and SEO"
              />
            </div>
            <BlogEditor
              value={form.contentHtml}
              onChange={(html) => update("contentHtml", html)}
            />
          </div>

          <div className={styles.sidePanel}>
            <div className={styles.sideCard}>
              <h3>Publish</h3>
              <div className={styles.field}>
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => update("status", e.target.value as BlogPostStatus)}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="slug">URL slug</label>
                <input
                  id="slug"
                  value={slugEdited ? (form.slug ?? "") : slugPreview}
                  onChange={(e) => {
                    setSlugEdited(true);
                    update("slug", e.target.value);
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  /blog/{slugPreview}
                </span>
              </div>
            </div>

            <div className={styles.sideCard}>
              <h3>Media</h3>
              <div className={styles.field}>
                <label htmlFor="cover">Cover image URL</label>
                <input
                  id="cover"
                  value={form.coverImageUrl ?? ""}
                  onChange={(e) => update("coverImageUrl", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className={styles.sideCard}>
              <h3>Author</h3>
              <div className={styles.field}>
                <label htmlFor="author">Name</label>
                <input
                  id="author"
                  value={form.authorName ?? ""}
                  onChange={(e) => update("authorName", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="role">Role</label>
                <input
                  id="role"
                  value={form.authorRole ?? ""}
                  onChange={(e) => update("authorRole", e.target.value)}
                />
              </div>
            </div>

            <div className={styles.sideCard}>
              <h3>Tags</h3>
              <div className={styles.field}>
                <label htmlFor="tags">Comma-separated</label>
                <input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Governance, Finance"
                />
              </div>
            </div>

            <div className={styles.sideCard}>
              <h3>SEO</h3>
              <div className={styles.field}>
                <label htmlFor="seo-title">Meta title</label>
                <input
                  id="seo-title"
                  value={form.seoTitle ?? ""}
                  onChange={(e) => update("seoTitle", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="seo-desc">Meta description</label>
                <textarea
                  id="seo-desc"
                  value={form.seoDescription ?? ""}
                  onChange={(e) => update("seoDescription", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
