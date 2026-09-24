const STORAGE_KEY = "salanor.blog.session";

export function getBlogSessionKey(): string {
  if (typeof window === "undefined") return "server";
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!key) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    return `s-${Date.now()}`;
  }
}
