type GitHubFileResponse = {
  content?: string;
  sha?: string;
  encoding?: string;
};

type GitHubDirEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

function githubConfig(): { token: string; repo: string; branch: string } | null {
  const token = process.env.BLOG_GITHUB_TOKEN?.trim();
  if (!token) return null;
  const repo = process.env.BLOG_GITHUB_REPO?.trim() || "salanor-ltd/salanor";
  const branch = process.env.BLOG_GITHUB_BRANCH?.trim() || "main";
  return { token, repo, branch };
}

export function githubWriteEnabled(): boolean {
  return githubConfig() !== null;
}

async function githubFetch(path: string, init?: RequestInit): Promise<Response> {
  const cfg = githubConfig();
  if (!cfg) throw new Error("BLOG_GITHUB_TOKEN is not configured");

  const url = `https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function githubGetTextFile(repoPath: string): Promise<{ text: string; sha: string } | null> {
  const res = await githubFetch(repoPath);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub read failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as GitHubFileResponse;
  if (!json.content || !json.sha) throw new Error("GitHub file response missing content/sha");
  const text = Buffer.from(json.content, "base64").toString("utf8");
  return { text, sha: json.sha };
}

export async function githubListMarkdownFiles(repoDir: string): Promise<string[]> {
  const res = await githubFetch(repoDir.replace(/^\//, ""));
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub list failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const entries = (await res.json()) as GitHubDirEntry[];
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".md") && e.name.toLowerCase() !== "readme.md")
    .map((e) => e.path);
}

export async function githubPutFile(
  repoPath: string,
  contentUtf8: string,
  commitMessage: string,
  existingSha?: string | null,
): Promise<void> {
  const cfg = githubConfig();
  if (!cfg) throw new Error("BLOG_GITHUB_TOKEN is not configured");

  const url = `https://api.github.com/repos/${cfg.repo}/contents/${repoPath.replace(/^\//, "")}`;
  const body: Record<string, string> = {
    message: commitMessage,
    content: Buffer.from(contentUtf8, "utf8").toString("base64"),
    branch: cfg.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed (${res.status}): ${err.slice(0, 300)}`);
  }
}

export async function githubDeleteFile(repoPath: string, commitMessage: string): Promise<void> {
  const cfg = githubConfig();
  if (!cfg) throw new Error("BLOG_GITHUB_TOKEN is not configured");

  const existing = await githubGetTextFile(repoPath);
  if (!existing) return;

  const url = `https://api.github.com/repos/${cfg.repo}/contents/${repoPath.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: commitMessage,
      sha: existing.sha,
      branch: cfg.branch,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub delete failed (${res.status}): ${err.slice(0, 300)}`);
  }
}

export async function githubPutBinaryFile(
  repoPath: string,
  bytes: Buffer,
  commitMessage: string,
  existingSha?: string | null,
): Promise<void> {
  const cfg = githubConfig();
  if (!cfg) throw new Error("BLOG_GITHUB_TOKEN is not configured");

  const url = `https://api.github.com/repos/${cfg.repo}/contents/${repoPath.replace(/^\//, "")}`;
  const body: Record<string, string> = {
    message: commitMessage,
    content: bytes.toString("base64"),
    branch: cfg.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub media upload failed (${res.status}): ${err.slice(0, 300)}`);
  }
}
