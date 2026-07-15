import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">An infrastructure company for a world software now runs.</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        Salanor is built by engineers, researchers, and operators who have spent their careers inside the systems most
        people never see - the ones that decide, settle, approve, and route.
      </p>
      <h2 className="mt-12 text-xl font-semibold text-ink">Why we exist</h2>
      <p className="mt-4 leading-relaxed text-ink/90">
        Every meaningful technology eventually needs an accountability layer. Finance needed double-entry bookkeeping.
        The web needed TLS. Aviation needed the black box. Without these layers, underlying technology stays unsafe
        and untrusted.
      </p>
      <p className="mt-4 leading-relaxed text-ink/90">
        Autonomous and AI-driven software does not have that layer yet. It is being deployed anyway, into decisions
        that change people's lives. Someone has to build it deliberately - with the seriousness the problem deserves.
        That is the work.
      </p>
      <h2 className="mt-12 text-xl font-semibold text-ink">Principles</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-ink/90">
        <li>Trust is infrastructure - not a dashboard, not a bolt-on feature.</li>
        <li>Verifiable beats persuasive - show evidence, not vibes.</li>
        <li>Boring on purpose - infrastructure is judged in years.</li>
        <li>Open where it matters - standards and schemas public; execution is our edge.</li>
        <li>Regulated-first - if it works for a serious examiner, it works everywhere else.</li>
      </ul>
    </div>
  );
}
