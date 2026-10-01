import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bylineEmail =
    process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ??
    process.env.PRISMA_SEED_BYLINE_EMAIL?.trim().toLowerCase();

  if (bylineEmail) {
    await prisma.$executeRaw`
      UPDATE account
      SET
        byline_name = COALESCE(byline_name, 'Ada Example'),
        byline_title = COALESCE(byline_title, 'Research lead'),
        byline_bio = COALESCE(byline_bio, 'Seed byline for local development and CMS previews.'),
        updated_at = now()
      WHERE lower(email) = ${bylineEmail}
    `;
  }

  await prisma.openRole.upsert({
    where: { slug: "staff-security-engineer" },
    create: {
      slug: "staff-security-engineer",
      title: "Staff Security Engineer",
      team: "Aegis",
      location: "Remote (US time zones)",
      seniority: "Staff",
      employmentType: "full_time",
      summary:
        "Own hardening and review for the aegis stack.\n\nYou will shape how we think about trust boundaries and evidence.",
      requirements: "Strong systems background, cryptographic intuition, and appetite for clear writing.",
      compensationRange: null,
      postedAt: new Date(),
      closesAt: null,
      status: "open",
    },
    update: {
      status: "open",
    },
  });

  await prisma.openRole.upsert({
    where: { slug: "senior-product-engineer" },
    create: {
      slug: "senior-product-engineer",
      title: "Senior Product Engineer",
      team: "Aether",
      location: "Remote (EU / US)",
      seniority: "Senior",
      employmentType: "full_time",
      summary:
        "Ship product surfaces practitioners love.\n\nWe value taste, velocity, and a bias toward boring, reliable infra.",
      requirements: "React/Next experience, Postgres comfort, and scrappy prototyping skills.",
      compensationRange: null,
      postedAt: new Date(),
      closesAt: null,
      status: "open",
    },
    update: {
      status: "open",
    },
  });

  await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000010" },
    create: {
      id: "00000000-0000-4000-8000-000000000010",
      name: "Dev Organization",
      slug: "dev-org",
      plan: "starter",
    },
    update: { name: "Dev Organization" },
  });

  let authorAccountId: string | null = null;
  if (bylineEmail) {
    const row = await prisma.account.findFirst({
      where: { email: { equals: bylineEmail, mode: "insensitive" } },
      select: { id: true },
    });
    authorAccountId = row?.id ?? null;
  }

  if (authorAccountId) {
    await prisma.researchPost.upsert({
      where: { slug: "evidence-bundles-101" },
      create: {
        slug: "evidence-bundles-101",
        title: "Evidence bundles 101",
        dek: "A seed post for listing and detail pages in local dev.",
        body:
          "This is placeholder body copy for the Salanor web seed.\n\n" +
          "Paragraphs are split on blank lines and rendered as plain text — no raw HTML is interpreted.",
        authorAccountId,
        track: "Labs",
        publishedAt: new Date(),
        readingMinutes: 4,
        heroImageUrl: null,
        ogImageUrl: null,
        status: "published",
      },
      update: {
        status: "published",
        authorAccountId,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
