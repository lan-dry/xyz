import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? process.env.ADMIN_EMAILS?.split(",")[0] ?? "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");

  if (!email) {
    console.error(
      "Set SEED_SUPERADMIN_EMAIL or ADMIN_EMAILS (first entry) to the founder email, then re-run.",
    );
    process.exit(1);
  }

  const row = await prisma.salInternalUser.upsert({
    where: { email },
    create: { email, role: "superadmin" },
    update: { role: "superadmin" },
  });

  console.log(`sal_internal_users: ${row.email} → role=${row.role} (id=${row.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
