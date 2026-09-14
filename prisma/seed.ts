import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const author = await prisma.author.upsert({
    where: {
      id: "00000000-0000-4000-8000-000000000001",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Ada Example",
      role: "Research lead",
      bio: "Seed author for local development and CMS previews.",
      photoUrl: null,
      links: null,
    },
    update: {
      name: "Ada Example",
      role: "Research lead",
      bio: "Seed author for local development and CMS previews.",
    },
  });

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

  await prisma.researchPost.upsert({
    where: { slug: "evidence-bundles-101" },
    create: {
      slug: "evidence-bundles-101",
      title: "Evidence bundles 101",
      dek: "A seed post for listing and detail pages in local dev.",
      body:
        "This is placeholder body copy for the Salanor web seed.\n\n" +
        "Paragraphs are split on blank lines and rendered as plain text — no raw HTML is interpreted.",
      authorId: author.id,
      track: "Labs",
      publishedAt: new Date(),
      readingMinutes: 4,
      heroImageUrl: null,
      ogImageUrl: null,
      status: "published",
    },
    update: {
      status: "published",
      authorId: author.id,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
