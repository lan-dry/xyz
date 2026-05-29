import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Privacy</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        A GDPR/CCPA-aligned policy will be published here before production launch. Until then, collect only what you
        need in development environments.
      </p>
    </div>
  );
}
