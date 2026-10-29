"use client";

import type { CaseFourAnswers } from "@/lib/case-story";
import { ui } from "@/components/console/console-ui";

type Props = {
  answers: CaseFourAnswers;
};

export function CaseFourAnswersPanel({ answers }: Props) {
  const cards = [
    answers.whatHappened,
    answers.who,
    answers.whyAllowed,
    {
      title: answers.canTrust.title,
      detail: `${answers.canTrust.detail} ${answers.canTrust.verifiedHint}`,
    },
  ];

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle} style={{ marginBottom: "0.75rem" }}>
        The four answers
      </h2>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
          gap: "0.75rem",
        }}
      >
        {cards.map((card) => (
          <li
            key={card.title}
            className={`${ui.card} ${ui.cardPad}`}
            style={{
              borderColor: "var(--console-accent, #0d9488)",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: "0.35rem" }}>
              {card.title}
            </strong>
            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                lineHeight: 1.5,
                color: "var(--console-fg-muted)",
              }}
            >
              {card.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
