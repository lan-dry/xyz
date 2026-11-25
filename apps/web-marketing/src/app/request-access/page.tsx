import type { Metadata } from "next";

import { RequestAccessForm } from "@/components/marketing/request-access-form";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import page from "@/components/marketing/marketing-page.module.css";

export const metadata: Metadata = {
  title: "Request sandbox access",
  description: "Ask for a Salanor sandbox. Work email required. Synthetic data only.",
};

export default function RequestAccessPage() {
  return (
    <section className={page.page}>
      <div className={`${page.inner} ${page.narrow}`}>
        <ScrollReveal>
          <p className="section-label">Sandbox</p>
          <h1 className={page.title}>Request access</h1>
          <p className={page.lead}>
            Tell us who you are. After approval we create a sandbox and send an admin invite.
            The sandbox holds synthetic data only.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <RequestAccessForm />
        </ScrollReveal>
      </div>
    </section>
  );
}
