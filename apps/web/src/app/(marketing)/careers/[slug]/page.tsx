import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export default async function CareerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const role = await prisma.openRole.findFirst({
    where: { slug, status: "open" },
  });

  if (!role) {
    notFound();
  }

  const summaryBlocks = role.summary.split(/\n\n+/).filter(Boolean);
  const siteUrl = process.env.AUTH_URL?.replace(/\/$/, "") ?? "https://salanor.com";
  const employmentType =
    role.employmentType === "part_time"
      ? "PART_TIME"
      : role.employmentType === "contract"
        ? "CONTRACTOR"
        : "FULL_TIME";

  const jobPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: `${role.summary}\n\n${role.requirements}`,
    datePosted: role.postedAt.toISOString().slice(0, 10),
    validThrough: role.closesAt?.toISOString().slice(0, 10),
    employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: "Salanor",
      sameAs: siteUrl,
    },
    jobLocation: {
      "@type": "Place",
      name: role.location,
    },
    applicantLocationRequirements: {
      "@type": "Country",
      name: role.location,
    },
    identifier: {
      "@type": "PropertyValue",
      name: "Salanor",
      value: role.slug,
    },
    url: `${siteUrl}/careers/${role.slug}`,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }} />
      <p className="text-sm">
        <Link href="/careers" className="text-teal no-underline hover:underline">
          ← Careers
        </Link>
      </p>
      <h1 className="mt-6 text-3xl font-semibold text-ink">{role.title}</h1>
      <p className="mt-2 text-ink/80">
        {role.team} · {role.location} · {role.seniority} · {role.employmentType}
      </p>
      <div className="mt-10 space-y-4 leading-relaxed text-ink/90">
        {summaryBlocks.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <p className="mt-10">
        <Link href="/contact" className="rounded bg-teal px-4 py-2 text-bone no-underline hover:opacity-90">
          Apply or inquire
        </Link>
      </p>
    </div>
  );
}
