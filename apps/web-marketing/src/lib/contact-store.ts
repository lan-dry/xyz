import pg from "pg";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for contact form storage");
  pool = new pg.Pool({ connectionString: url, max: 4 });
  return pool;
}

export type InsertContactMessageInput = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  sourcePath: string;
  ipHash: string;
};

export async function insertContactMessage(input: InsertContactMessageInput): Promise<void> {
  await getPool().query(
    `INSERT INTO contact_messages (
       id, name, email, organization, role, reason, message, source_path, ip_hash, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')`,
    [
      input.id,
      input.name,
      input.email,
      input.organization,
      input.role,
      input.reason,
      input.message,
      input.sourcePath,
      input.ipHash,
    ],
  );
}
