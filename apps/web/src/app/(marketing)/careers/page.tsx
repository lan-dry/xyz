import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Careers",
};

export default async function CareersPage() {
  const roles = await prisma.openRole.findMany({
    where: { status: "open" },
    orderBy: { postedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Build the layer the next decade rests on.</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        We are a small team, hiring slowly. If the work we describe sounds like what you have been waiting to do, we
        would like to meet you.
      </p>

      {roles.length === 0 ? (
        <p className="mt-8 text-ink/70">
          There are no open roles listed right now.{" "}
          <Link href="/contact" className="text-teal no-underline hover:underline">
            Get in touch
          </Link>{" "}
          if you would like to introduce yourself.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {roles.map((role) => (
            <li key={role.id} className="border-b border-black/10 pb-4 last:border-0">
              <Link href={`/careers/${role.slug}`} className="text-lg font-medium text-teal no-underline hover:underline">
                {role.title}
              </Link>
              <p className="mt-1 text-sm text-ink/75">
                {role.team} · {role.location} · {role.seniority}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10">
        <Link href="/contact" className="text-teal no-underline hover:underline">
          Get in touch
        </Link>
      </p>
    </div>
  );
}
