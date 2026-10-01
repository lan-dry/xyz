export type BlogPostStatus = "draft" | "published";

export type BlogMarkdownFrontmatter = {
  title: string;
  slug: string;
  excerpt: string;
  authorName: string;
  authorRole?: string | null;
  tags?: string[];
  status: BlogPostStatus;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  coverImageUrl?: string | null;
  /** Stable Salanor account UUID — public byline loads from Ops → My public profile. */
  authorAccountId?: string | null;
  /** Legacy fallback if authorAccountId is missing (email changes break this link). */
  authorEmail?: string | null;
  createdByEmail?: string | null;
  lastEditedByEmail?: string | null;
  lastEditedAt?: string | null;
};

export type BlogMarkdownPost = BlogMarkdownFrontmatter & {
  bodyMarkdown: string;
  filePath: string;
};

export type BlogPostSaveInput = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  authorName: string;
  authorRole?: string | null;
  tags?: string[];
  status: BlogPostStatus;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  coverImageUrl?: string | null;
};

export type BlogEditorContext = {
  editorEmail: string;
  editorAccountId?: string;
  editorDisplayName?: string | null;
  isCreate: boolean;
  previousCreatedByEmail?: string | null;
  /** Preserved on edit so co-authors do not reassign the byline account. */
  priorAuthorAccountId?: string | null;
  priorAuthorEmail?: string | null;
};
