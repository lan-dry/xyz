export type BlogPostStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  authorName: string;
  authorRole: string | null;
  tags: string[];
  status: BlogPostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  readingTimeMinutes: number;
  lastPublishedByEmail?: string | null;
};

export type BlogPostInput = {
  slug?: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl?: string | null;
  authorName?: string;
  authorRole?: string | null;
  tags?: string[];
  status?: BlogPostStatus;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type BlogPostListItem = Pick<
  BlogPost,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "coverImageUrl"
  | "authorName"
  | "authorRole"
  | "tags"
  | "status"
  | "publishedAt"
  | "createdAt"
  | "updatedAt"
  | "readingTimeMinutes"
  | "lastPublishedByEmail"
>;
