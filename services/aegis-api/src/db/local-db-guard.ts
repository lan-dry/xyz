/** Block accidental remote DB commands from local-only CLIs. */
export function assertLocalDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  let hostname: string;
  try {
    const normalized = raw.replace(/^postgres(ql)?:\/\//i, "http://");
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    console.error("DATABASE_URL is not a valid Postgres URL.");
    process.exit(1);
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "postgres", "db", "host.docker.internal"]);
  if (localHosts.has(hostname)) {
    return;
  }

  console.error("");
  console.error("Refused: this command is LOCAL Docker Postgres only.");
  console.error(`  DATABASE_URL host: ${hostname}`);
  console.error("");
  console.error("  Point DATABASE_URL at postgresql://salanor:salanor@127.0.0.1:5432/aegis");
  console.error("  On Neon: use SQL Editor + pnpm db:migrate + pnpm db:seed:bootstrap only.");
  console.error("");
  process.exit(1);
}
