"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlatformSessionAction } from "@/lib/platform-server-session";
import { getPrisma } from "@/lib/prisma";
import { markdownToNewsletterHtml } from "@/lib/newsletter-markdown";

function marketingInternalBase(): string {
  return (
    process.env.MARKETING_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_MARKETING_URL?.trim() ||
    "http://localhost:3001"
  );
}

function opsSecret(): string {
  const secret = process.env.NEWSLETTER_OPS_SECRET?.trim();
  if (!secret) throw new Error("NEWSLETTER_OPS_SECRET is not configured on Platform Ops");
  return secret;
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is not configured");
  return prisma;
}

function parseSchedule(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createNewsletterCampaign(formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const subject = String(formData.get("subject") ?? "").trim();
  const previewText = String(formData.get("previewText") ?? "").trim() || null;
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const scheduledAt = parseSchedule(formData.get("scheduledAt"));

  if (!subject || !bodyMarkdown) {
    throw new Error("Subject and body are required");
  }

  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new Error("Schedule time must be in the future");
  }

  const { html, text } = markdownToNewsletterHtml(bodyMarkdown);
  const status = scheduledAt ? "scheduled" : "draft";

  const prisma = requirePrisma();
  await prisma.$executeRaw`
    INSERT INTO newsletter_campaigns (
      subject, preview_text, body_markdown, body_html, body_text,
      status, scheduled_at, created_by_email
    )
    VALUES (
      ${subject}, ${previewText}, ${bodyMarkdown}, ${html}, ${text},
      ${status}, ${scheduledAt}, ${session.email}
    )
  `;

  revalidatePath("/content/newsletter");
}

export async function updateNewsletterCampaign(campaignId: string, formData: FormData) {
  await assertPlatformSessionAction("platform:content.write");
  const subject = String(formData.get("subject") ?? "").trim();
  const previewText = String(formData.get("previewText") ?? "").trim() || null;
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const scheduledAt = parseSchedule(formData.get("scheduledAt"));

  if (!subject || !bodyMarkdown) {
    throw new Error("Subject and body are required");
  }

  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new Error("Schedule time must be in the future");
  }

  const { html, text } = markdownToNewsletterHtml(bodyMarkdown);
  const status = scheduledAt ? "scheduled" : "draft";

  const prisma = requirePrisma();
  const updated = await prisma.$executeRaw`
    UPDATE newsletter_campaigns
    SET
      subject = ${subject},
      preview_text = ${previewText},
      body_markdown = ${bodyMarkdown},
      body_html = ${html},
      body_text = ${text},
      status = ${status},
      scheduled_at = ${scheduledAt},
      updated_at = now()
    WHERE id = ${campaignId}::uuid
      AND status IN ('draft', 'scheduled', 'failed')
  `;

  if (updated === 0) {
    throw new Error("Campaign cannot be edited in its current status");
  }

  revalidatePath("/content/newsletter");
  revalidatePath(`/content/newsletter/${campaignId}`);
  redirect(`/content/newsletter/${campaignId}?saved=1`);
}

export async function sendNewsletterCampaignAction(campaignId: string) {
  await assertPlatformSessionAction("platform:content.write");
  const base = marketingInternalBase();
  const res = await fetch(`${base}/api/internal/newsletter/campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsSecret()}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Send failed (${res.status})`);
  }
  revalidatePath("/content/newsletter");
  revalidatePath(`/content/newsletter/${campaignId}`);
}

export async function cancelScheduledCampaignAction(campaignId: string) {
  await assertPlatformSessionAction("platform:content.write");
  const prisma = requirePrisma();
  await prisma.$executeRaw`
    UPDATE newsletter_campaigns
    SET status = 'draft', scheduled_at = NULL, updated_at = now()
    WHERE id = ${campaignId}::uuid AND status = 'scheduled'
  `;
  revalidatePath("/content/newsletter");
  revalidatePath(`/content/newsletter/${campaignId}`);
}

export async function testNewsletterCampaignAction(campaignId: string) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const base = marketingInternalBase();
  const res = await fetch(`${base}/api/internal/newsletter/campaigns/${campaignId}/test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opsSecret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: session.email }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Test send failed (${res.status})`);
  }
}
