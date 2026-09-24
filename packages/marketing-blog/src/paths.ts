import { existsSync } from "node:fs";
import path from "node:path";

const CONTENT_REL = path.join("apps", "web-marketing", "content", "blog");
const MEDIA_REL = path.join("apps", "web-marketing", "public", "blog", "media");

export function resolveMonorepoRoot(): string {
  const fromEnv = process.env.SALANOR_MONOREPO_ROOT?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }

  if (process.env.VERCEL === "1") {
    const fromPlatformApp = path.resolve(process.cwd(), "../..");
    if (existsSync(path.join(fromPlatformApp, CONTENT_REL))) {
      return fromPlatformApp;
    }
  }

  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, CONTENT_REL);
    if (existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.resolve(process.cwd(), "../..");
}

export function blogContentDir(): string {
  const configured = process.env.BLOG_CONTENT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(resolveMonorepoRoot(), CONTENT_REL);
}

export function blogMediaDir(): string {
  const configured = process.env.BLOG_MEDIA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(resolveMonorepoRoot(), MEDIA_REL);
}

export function blogContentRepoPath(slug: string): string {
  return `${CONTENT_REL.replace(/\\/g, "/")}/${slug}.md`;
}

export function blogMediaRepoPath(filename: string): string {
  return `${MEDIA_REL.replace(/\\/g, "/")}/${filename}`;
}

export function blogPostFilePath(slug: string): string {
  return path.join(blogContentDir(), `${slug}.md`);
}

export function localContentAvailable(): boolean {
  const dir = blogContentDir();
  return existsSync(dir);
}
