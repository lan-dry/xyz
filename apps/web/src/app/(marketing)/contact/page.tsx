import type { Metadata } from "next";

import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Talk to a human.</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        Four routes: design partners, press, careers, and security disclosures. Submit the form below; we persist it
        securely and optionally notify the team via Slack (see README).
      </p>
      <ContactForm />
    </div>
  );
}
