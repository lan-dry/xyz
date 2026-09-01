"""Generate Bank of Kigali AI governance deck (.pptx).

Run: python docs/presentations/build-bank-of-kigali-deck.py
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "deck_base", ROOT / "build-automation-governance-deck.py"
)
base = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(base)

OUT = ROOT / "Salanor-Bank-of-Kigali-AI-Governance-v3.pptx"


def slide_bk_title(prs) -> None:
    slide = base.blank(prs)
    base.add_rect(slide, base.Inches(0), base.Inches(0), base.Inches(10), base.Inches(0.06), base.TEAL_DIM)
    if base.LOGO.exists():
        slide.shapes.add_picture(str(base.LOGO), base.MARGIN_L, base.Inches(0.42), width=base.Inches(0.38))
    base.write_text(
        slide, base.MARGIN_L, base.Inches(0.55), base.CONTENT_W, base.Inches(0.28),
        "SALANOR · CONFIDENTIAL · BANK OF KIGALI", size=9, color=base.TEAL, bold=True,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(1.05), base.Inches(8.5), base.Inches(1.5),
        "Governed AI & automation\nfor banking operations",
        size=34, bold=True,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(2.65), base.Inches(8.2), base.Inches(1.1),
        "How to adopt AI and automation without losing control, accountability, or audit proof.",
        size=15, color=base.MUTED,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.35), base.CONTENT_W, base.Inches(0.35),
        "Landry Bougang Fotso · Founder, Salanor Ltd · Kigali",
        size=11, color=base.DIM,
    )
    base.add_notes(
        slide,
        "Thank them for the meeting. You understand BK has been careful about AI — that is the right instinct. "
        "Today: what AI security really means, where Salanor Aegis fits, and a live demo of control + proof.",
    )


def slide_why_hesitate(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Why banks hesitate", "AI without control is a liability, not an advantage")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.8),
        [
            "A wrong payment or account change can execute at machine speed",
            "Regulators and the board ask: who authorized this, and can you prove it?",
            "Logs and chat threads are not enough for internal audit or BNR supervision",
            "One incident can freeze every AI project for years",
            "Teams block automation because nobody wants to sign without evidence",
        ],
        size=13,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.85), base.CONTENT_W, base.Inches(0.6),
        "Your caution is correct. The question is not whether to use AI — it is how to use it safely.",
        size=12, color=base.MUTED,
    )
    base.add_notes(slide, "Validate their fear. Do not dismiss it. They are right to hesitate without governance.")


def slide_bk_ai_use_cases(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "AI at Bank of Kigali",
        "Many use cases — one protection pattern for sensitive actions",
    )
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(4.2),
        [
            "Customer chatbot / voice → gate card block, transfer, account changes",
            "Vendor & treasury payments → gate before core banking executes (today's demo)",
            "KYC / AML AI → gate account activation and compliance overrides",
            "Fraud alerts → gate account release and high-risk unblocks",
            "Credit / lending AI → gate limit assignment and account flags",
            "Internal copilot → gate when AI calls payment or account APIs",
        ],
        size=12,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.05), base.CONTENT_W, base.Inches(0.55),
        "Aegis does not read every prompt. It governs actions — whatever triggered them: AI, automation, or script.",
        size=11, color=base.WHITE, bold=True,
    )
    base.add_notes(
        slide,
        "Full list: Bank-of-Kigali-AI-USE-CASES.md. Read-only analytics = different security topic.",
    )


def slide_data_trust(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Your data · Our role",
        "External vendor — minimum data, maximum control for Bank of Kigali",
    )
    rows = [
        ("Isolated tenant", "Bank of Kigali organization — no cross-bank visibility"),
        ("Data minimization", "Masked accounts & references in traces — not full PAN or card numbers"),
        ("Keys stay with you", "BYOK in production — Salanor verifies signatures, not your private keys"),
        ("No training on your data", "Unless explicitly agreed in writing"),
        ("What we store", "Governance metadata: rules, approvers, timestamps, audit chain"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.72))
        base.write_text(
            slide, base.MARGIN_L + base.Inches(0.18), base.Inches(y + 0.1),
            base.Inches(2.1), base.Inches(0.28), head, size=11, bold=True, color=base.TEAL,
        )
        base.write_text(
            slide, base.MARGIN_L + base.Inches(2.35), base.Inches(y + 0.12),
            base.Inches(6.0), base.Inches(0.5), body, size=11, color=base.MUTED,
        )
        y += 0.82
    base.add_notes(
        slide,
        "Say this BEFORE demo. See Bank-of-Kigali-AI-USE-CASES.md Data privacy script.",
    )


def slide_ai_layers(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "AI security is layered",
        "No single product covers everything — be honest about the stack",
    )
    rows = [
        ("Infrastructure & data", "Network, IAM, encryption, DLP — your existing security team / vendors"),
        ("Models & prompts", "Vendor choice, testing, prompt safety, monitoring — MLOps / AI platform"),
        ("Actions & operations", "Rules, human approval, signed traces, audit exports — Salanor Aegis"),
        ("Oversight", "Policies, board reporting, regulatory evidence — compliance + Aegis exports"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.95))
        base.write_text(
            slide, base.MARGIN_L + base.Inches(0.2), base.Inches(y + 0.12),
            base.Inches(2.4), base.Inches(0.3), head, size=12, bold=True, color=base.TEAL,
        )
        base.write_text(
            slide, base.MARGIN_L + base.Inches(2.65), base.Inches(y + 0.14),
            base.Inches(5.8), base.Inches(0.65), body, size=11, color=base.MUTED,
        )
        y += 1.05
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.05), base.CONTENT_W, base.Inches(0.45),
        "Aegis is the operational control plane: nothing sensitive moves without rules, approval, and proof.",
        size=12, color=base.WHITE, bold=True,
    )
    base.add_notes(
        slide,
        "If they want full AI security: Aegis is the actions layer. You partner with their SOC and model vendors. "
        "Do not claim to replace firewall or LLM safety testing.",
    )


def slide_where_aegis(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Where Aegis sits", "Before money, accounts, or client records change")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.5),
        [
            "Customer-facing AI suggests an action → Aegis evaluates rules → human approves if required",
            "Internal copilot prepares a transfer or limit change → same gate before execution",
            "Automated KYC / onboarding workflow → block exceptions until a named person signs",
            "Any API, script, or orchestrator touching sensitive operations → one accountability chain",
        ],
        size=13,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.75), base.CONTENT_W, base.Inches(0.7),
        "Works with chatbots, copilots, n8n, and core APIs. Aegis does not judge model output — it governs operations.",
        size=12, color=base.MUTED,
    )
    base.add_notes(slide, "Key line: AI proposes, rules decide, humans authorize when needed, proof remains.")


def slide_bk_use_cases(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Bank of Kigali", "Where the protection layer applies")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.5),
        [
            "Vendor & outbound payments above threshold → approval before core banking executes",
            "KYC / onboarding exceptions → block until compliance signs with full context",
            "Account or limit changes → dual control with named approver and signed trace",
            "AI-assisted customer or internal channels → gate before any financial action",
            "Any automation touching money or client records → one accountability chain",
        ],
        size=13,
    )
    base.add_notes(slide, "Today's demo: AI-assisted vendor payment USD 2,847.50 · PO-2026-8842.")


def slide_you_keep_add(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Your stack", "You keep your systems — Aegis adds control and proof")
    w = base.Inches(4.15)
    y = base.Inches(2.45)
    h = base.Inches(2.5)
    base.add_round_card(slide, base.MARGIN_L, y, w, h)
    base.write_text(
        slide, base.MARGIN_L + base.Inches(0.2), y + base.Inches(0.2), w - base.Inches(0.3),
        base.Inches(0.35), "You keep", size=14, bold=True, color=base.TEAL,
    )
    base.write_text(
        slide, base.MARGIN_L + base.Inches(0.2), y + base.Inches(0.6), w - base.Inches(0.35),
        base.Inches(1.7),
        "Core banking, channels, SIEM, AML engine, AI model vendors, existing governance.",
        size=12, color=base.MUTED,
    )
    x2 = base.MARGIN_L + w + base.Inches(0.25)
    base.add_round_card(slide, x2, y, w, h)
    base.write_text(
        slide, x2 + base.Inches(0.2), y + base.Inches(0.2), w - base.Inches(0.3),
        base.Inches(0.35), "Aegis adds", size=14, bold=True, color=base.TEAL,
    )
    base.write_text(
        slide, x2 + base.Inches(0.2), y + base.Inches(0.6), w - base.Inches(0.35),
        base.Inches(1.7),
        "Rules before execution, named human approval, signed register, exports for audit and BNR reviews.",
        size=12, color=base.WHITE,
    )
    base.add_notes(slide, "Not core banking. Not SIEM. Complementary layer they are missing for AI-era operations.")


def slide_four_steps(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "How it works", "Four steps — one chain of proof")
    steps = [
        ("01", "Connect", "API, SDK, n8n, or open APS-1 ingest"),
        ("02", "Apply rules", "Allow, block, or require human approval"),
        ("03", "Record & sign", "Append-only ledger, witness batches"),
        ("04", "Replay & export", "Console review, integrity hash, audit bundle"),
    ]
    w = base.Inches(2.05)
    gap = base.Inches(0.18)
    y = base.Inches(2.45)
    h = base.Inches(2.4)
    for i, (num, title, desc) in enumerate(steps):
        x = base.MARGIN_L + i * (w + gap)
        base.add_round_card(slide, x, y, w, h)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.15), w, base.Inches(0.25), num, size=10, bold=True, color=base.TEAL)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.45), w - base.Inches(0.2), base.Inches(0.35), title, size=12, bold=True)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.85), w - base.Inches(0.25), base.Inches(1.4), desc, size=10, color=base.MUTED)
    base.add_notes(slide, "Keep this short — demo is next.")


def slide_demo(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Live demo", "AI-assisted vendor payment · Bank of Kigali scenario")
    base.add_round_card(slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.1))
    base.write_text(
        slide, base.MARGIN_L + base.Inches(0.25), base.Inches(2.55), base.Inches(8.2), base.Inches(2.8),
        "Workflow: procurement bot prepares payment after PO approval\n"
        "Amount: USD 2,847.50 → Rwanda Medical Supply Ltd · PO-2026-8842\n"
        "Source: BK Operations USD · ****7739\n"
        "Rule: above USD 1,000 → Head of Payment Operations must approve\n\n"
        "Without Aegis → transfer executes immediately.\n"
        "With Aegis → blocked until authorized · full signed trace · audit export",
        size=12,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.65), base.CONTENT_W, base.Inches(0.5),
        "Demo: Approvals → Traces → live block & approve → Exports",
        size=12, color=base.TEAL, bold=True,
    )
    base.add_notes(
        slide,
        "Follow Bank-of-Kigali-DEMO-SCENARIO.md. Say: your org would be Bank of Kigali isolated tenant.",
    )


def slide_approval(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Human approval", "Named approver — not just what happened, who authorized it")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.0),
        [
            "Email, Slack, PagerDuty, or SMS alerts — your configuration",
            "Approver identified, timestamped, linked to one trace",
            "Refusal or timeout → action does not execute",
            "History: approved, refused, expired — with the rule that applied",
        ],
        size=13,
    )
    base.add_notes(slide, "This is what risk and internal audit need for AI-era operations.")


def slide_audit(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Audit & compliance", "Evidence your teams can hold — not a certification claim")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.2),
        [
            "Export bundles by period with verifiable integrity hash",
            "Control mappings in exports today: SOC 2 and EU AI Act (roadmap: NIST AI RMF, ISO 42001)",
            "Step-by-step replay in console — rule, approval, execution",
            "Admin audit log: policies, keys, connections, exports",
            "Supports BNR supervision and Rwanda Law 058/2021 accountability for processing",
        ],
        size=12,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.85), base.CONTENT_W, base.Inches(0.55),
        "Salanor is not SOC 2 certified today. Exports are documentation aid for your audit — honest positioning.",
        size=11, color=base.MUTED,
    )
    base.add_notes(slide, "Do not overclaim certification. Emphasize operational proof for board and regulator.")


def slide_pilot(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Deploy on your workflow", "Proof of control — not a product experiment")
    rows = [
        ("What you get", "Rules, approvals, signed register, training, audit export on one BK workflow"),
        ("Where it runs", "Your isolated organization · your approvers · your policies"),
        ("Timeline", "Typically 4–8 weeks to wire one production-critical flow"),
        ("Proof of value", "BK risk or audit validates the trace and export without Salanor in the room"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.82))
        base.write_text(slide, base.MARGIN_L + base.Inches(0.2), base.Inches(y + 0.14), base.Inches(2.0), base.Inches(0.3), head, size=12, bold=True, color=base.TEAL)
        base.write_text(slide, base.MARGIN_L + base.Inches(2.3), base.Inches(y + 0.16), base.Inches(6.0), base.Inches(0.5), body, size=12, color=base.MUTED)
        y += 0.95
    base.add_notes(slide, "You are selling protection they deploy — not asking them to refine your roadmap.")


def slide_discussion(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Discussion", "Map the first workflow to protect at Bank of Kigali")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.5),
        [
            "Which payment, KYC, or AI-initiated workflow keeps risk awake at night?",
            "Who must approve high-value outbound transfers today — and how is that proven?",
            "Who from payment ops, risk, compliance, and IT security owns this decision?",
            "What would convince you the control layer works on a real BK flow?",
        ],
        size=13,
    )
    base.add_notes(slide, "Listen. Propose scoping call with payment ops + risk + IT — with a date.")


def slide_contact(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Contact", "Salanor Ltd · Kigali")
    base.write_text(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(2.5),
        "Landry Bougang Fotso\nFounder\n\n"
        "www.salanor.com\nwww.salanor.com/products/aegis\napp.salanor.com\n\n"
        "hello@salanor.com · partners@salanor.com",
        size=14,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.5), base.CONTENT_W, base.Inches(0.4),
        "Confidential · Prepared for Bank of Kigali",
        size=10, color=base.DIM,
    )
    base.add_notes(
        slide,
        "Thank them. Say you will send PDF after meeting. Propose scoping call with risk/IT if interest.",
    )


def main() -> None:
    prs = base.Presentation()
    prs.slide_width = base.Inches(10)
    prs.slide_height = base.Inches(7.5)
    slide_bk_title(prs)
    slide_why_hesitate(prs)
    slide_bk_ai_use_cases(prs)
    slide_ai_layers(prs)
    slide_data_trust(prs)
    slide_where_aegis(prs)
    slide_bk_use_cases(prs)
    slide_you_keep_add(prs)
    slide_four_steps(prs)
    slide_demo(prs)
    slide_approval(prs)
    slide_audit(prs)
    slide_pilot(prs)
    slide_discussion(prs)
    slide_contact(prs)
    prs.save(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
