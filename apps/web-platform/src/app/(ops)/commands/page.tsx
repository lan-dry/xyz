"use client";

import { useMemo, useState } from "react";

import { OpsShell } from "@/components/ops-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import {
  COMMAND_SECTIONS,
  ROLE_GUIDE,
  SCENARIO_CHEATSHEET,
} from "@/lib/command-reference";

import styles from "./commands.module.css";

export default function CommandsPage() {
  const { email, logout } = usePlatformSession();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_SECTIONS;
    return COMMAND_SECTIONS.map((section) => ({
      ...section,
      commands: section.commands.filter(
        (c) =>
          c.command.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.details.toLowerCase().includes(q),
      ),
    })).filter((s) => s.commands.length > 0);
  }, [query]);

  return (
    <OpsShell
      title="Command reference"
      subtitle="Every pnpm script and ops command — what it does, when to run it, and prerequisites. Run from monorepo root unless noted."
      staffEmail={email}
      onLogout={logout}
    >
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Sections">
          <p className={styles.tocTitle}>On this page</p>
          <a href="#roles" className={styles.tocLink}>
            Roles & access
          </a>
          <a href="#scenarios" className={styles.tocLink}>
            Scenario cheat sheet
          </a>
          {COMMAND_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={styles.tocLink}>
              {s.title}
            </a>
          ))}
        </nav>

        <div className={styles.main}>
          <label className={styles.searchWrap}>
            <span className="sr-only">Filter commands</span>
            <input
              type="search"
              className={styles.search}
              placeholder="Filter commands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <section id="roles" className={styles.section}>
            <h2 className={styles.sectionTitle}>Roles & access</h2>
            <p className={styles.sectionDesc}>
              Two different “admin” concepts — do not confuse them.
            </p>
            <div className={styles.roleGrid}>
              <RoleCard
                title={ROLE_GUIDE.platformRoles.title}
                body={ROLE_GUIDE.platformRoles.body}
                grant={ROLE_GUIDE.platformRoles.grant}
                cannot={ROLE_GUIDE.platformRoles.cannot}
                roles={ROLE_GUIDE.platformRoles.roles}
              />
              <RoleCard
                title={ROLE_GUIDE.orgAdmin.title}
                body={ROLE_GUIDE.orgAdmin.body}
                grant={ROLE_GUIDE.orgAdmin.grant}
                cannot={ROLE_GUIDE.orgAdmin.cannot}
              />
              <RoleCard title={ROLE_GUIDE.bootstrap.title} body={ROLE_GUIDE.bootstrap.body} />
            </div>
          </section>

          <section id="scenarios" className={styles.section}>
            <h2 className={styles.sectionTitle}>Scenario cheat sheet</h2>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>What to run</th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIO_CHEATSHEET.map((row) => (
                    <tr key={row.scenario}>
                      <td>{row.scenario}</td>
                      <td>
                        <code className={styles.inlineCode}>{row.steps}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {filtered.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <p className={styles.sectionDesc}>{section.description}</p>
              <div className={styles.commandList}>
                {section.commands.map((cmd) => (
                  <article key={cmd.command} className={`${ui.card} ${styles.commandCard}`}>
                    <div className={styles.commandHead}>
                      <code className={styles.commandCode}>{cmd.command}</code>
                      {cmd.destructive ? (
                        <span className={styles.badgeDestructive}>Destructive / dev-only</span>
                      ) : null}
                    </div>
                    <p className={styles.commandSummary}>{cmd.summary}</p>
                    <p className={styles.commandDetails}>{cmd.details}</p>
                    <dl className={styles.meta}>
                      <div>
                        <dt>When</dt>
                        <dd>{cmd.when}</dd>
                      </div>
                      {cmd.prerequisites ? (
                        <div>
                          <dt>Prerequisites</dt>
                          <dd>{cmd.prerequisites}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 ? (
            <p className={ui.loading}>No commands match your filter.</p>
          ) : null}

          <p className={styles.footerNote}>
            Source of truth: <code>package.json</code> (root) +{" "}
            <code>docs/COMMANDS.md</code>. Repo path: monorepo root on your machine.
          </p>
        </div>
      </div>
    </OpsShell>
  );
}

function RoleCard({
  title,
  body,
  grant,
  cannot,
  roles,
}: {
  title: string;
  body: string;
  grant?: string;
  cannot?: string;
  roles?: ReadonlyArray<{ name: string; slug: string; summary: string }>;
}) {
  return (
    <div className={`${ui.card} ${ui.cardPad} ${styles.roleCard}`}>
      <h3 className={styles.roleTitle}>{title}</h3>
      <p className={styles.roleBody}>{body}</p>
      {roles?.length ? (
        <ul className={styles.roleBody} style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem" }}>
          {roles.map((r) => (
            <li key={r.slug}>
              <strong>{r.name}</strong> ({r.slug}) — {r.summary}
            </li>
          ))}
        </ul>
      ) : null}
      {grant ? (
        <p className={styles.roleMeta}>
          <strong>How to grant:</strong> {grant}
        </p>
      ) : null}
      {cannot ? (
        <p className={styles.roleMeta}>
          <strong>Cannot:</strong> {cannot}
        </p>
      ) : null}
    </div>
  );
}
