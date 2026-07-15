import type { Metadata } from "next";
import Link from "next/link";

import { ContactAside } from "@/components/marketing/contact-aside";
import { ContactForm } from "@/components/marketing/contact-form";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import page from "@/components/marketing/marketing-page.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "Design partners, investors, press, and enterprise inquiries.",
};

export default function ContactPage() {
  return (
    <section className={page.page}>
      <div className={`${page.inner} ${page.split}`}>
        <ScrollReveal>
          <div>
            <p className="section-label">Contact</p>
            <h1 className={page.title}>Talk to us</h1>
            <ContactAside />
            <Link href="/" className={page.back}>
              ← Back to home
            </Link>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <ContactForm />
        </ScrollReveal>
      </div>
    </section>
  );
}
