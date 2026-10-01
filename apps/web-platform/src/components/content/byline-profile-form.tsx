"use client";

import { useState } from "react";

import { CmsMediaUrlField } from "@/components/content/cms-media-url-field";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

import type { PublicStaffProfile } from "@/lib/research-author";

type Props = {
  accountEmail: string;
  profile: PublicStaffProfile;
  action: (formData: FormData) => Promise<void>;
};

export function BylineProfileForm({ accountEmail, profile, action }: Props) {
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl ?? "");

  return (
    <form action={action} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        Account: {accountEmail}. This is <strong>your</strong> public author card on{" "}
        <code className="mono">/blog</code> and <code className="mono">/research</code>. Nothing is filled in
        until you save — we only suggest your display name in the name field.
      </p>

      <input name="name" defaultValue={profile.name} placeholder="Full name" className={ui.input} required />
      <input
        name="role"
        defaultValue={profile.role}
        placeholder="Title (e.g. Founder, Salanor · Lead, Risk Engineering)"
        className={ui.input}
        required
      />
      <textarea
        name="bio"
        rows={4}
        defaultValue={profile.bio}
        placeholder="Short bio (2–4 sentences)"
        className={ui.textarea}
        required
      />

      <CmsMediaUrlField
        name="photoUrl"
        label="Profile photo"
        value={photoUrl}
        onChange={setPhotoUrl}
        placeholder="Upload below — stored on marketing CDN path"
      />

      <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
        <legend style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" }}>
          Social links (optional)
        </legend>
        <input
          name="linkedinUrl"
          type="url"
          defaultValue={profile.linkedinUrl ?? ""}
          placeholder="https://linkedin.com/in/…"
          className={ui.input}
        />
        <input
          name="xUrl"
          type="url"
          defaultValue={profile.xUrl ?? ""}
          placeholder="https://x.com/…"
          className={ui.input}
        />
        <input
          name="instagramUrl"
          type="url"
          defaultValue={profile.instagramUrl ?? ""}
          placeholder="https://instagram.com/…"
          className={ui.input}
        />
      </fieldset>

      <CmsFormSubmit label="Save public profile" pendingLabel="Saving…" />
    </form>
  );
}
