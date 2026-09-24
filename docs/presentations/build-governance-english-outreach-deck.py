"""Generate English outreach deck for South Africa and English-speaking contacts.

Run: python docs/presentations/build-governance-english-outreach-deck.py

Output:
  docs/presentations/Salanor-Aegis-Governance-English.pptx
  e:/salanor/Presentation/South-Africa/Salanor-Aegis-Governance-English.pptx (if folder exists)
"""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "deck_base", ROOT / "build-automation-governance-deck.py"
)
base = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(base)

OUT_REPO = ROOT / "Salanor-Aegis-Governance-English.pptx"
OUT_SA = Path("e:/salanor/Presentation/South-Africa/Salanor-Aegis-Governance-English.pptx")


def slide_title(prs) -> None:
    slide = base.blank(prs)
    base.add_rect(slide, base.Inches(0), base.Inches(0), base.Inches(10), base.Inches(0.06), base.TEAL_DIM)
    if base.LOGO.exists():
        slide.shapes.add_picture(str(base.LOGO), base.MARGIN_L, base.Inches(0.42), width=base.Inches(0.38))
    base.write_text(
        slide, base.MARGIN_L, base.Inches(0.55), base.CONTENT_W, base.Inches(0.28),
        "SALANOR · CONFIDENTIAL · 2026", size=9, color=base.TEAL, bold=True,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(1.05), base.Inches(8.5), base.Inches(1.5),
        "Governed automation\nfor finance and insurance",
        size=34, bold=True,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(2.65), base.Inches(8.2), base.Inches(1.1),
        "Payments, claims, KYC, limits: rules, human approval when required, "
        "signed proof you can export. Without replacing core banking or your claims system.",
        size=15, color=base.MUTED,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.35), base.CONTENT_W, base.Inches(0.35),
        "Landry Bougang Fotso · Founder, Salanor Ltd · Kigali, Rwanda",
        size=11, color=base.DIM,
    )
    base.add_notes(
        slide,
        "One sentence: when automation touches money or client files, who authorized what, "
        "under which rule, and can you prove it without rebuilding five systems?",
    )


def slide_why_now(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Why now",
        "A governance layer, not just automation",
    )
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.8),
        [
            "Teams already automate, or will with AI: payments, claims, KYC, limit changes",
            "The risk is not speed. It is having no proof when a controller asks who authorized what",
            "Logs say something happened. They rarely say which rule applied or which named approver signed off",
            "Aegis: rules before execution, named human approval when required, signed register you can export",
            "You gain: launch automation without every project dying in the risk committee",
        ],
        size=13,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.95), base.CONTENT_W, base.Inches(0.65),
        "When money or client data moves at machine speed, the board and regulator ask one question: "
        "who authorized this, under which rule, and can you prove it without rebuilding five systems?",
        size=12, color=base.TEAL, bold=True,
    )
    base.add_notes(slide, "Lead with this slide. This is the WHY.")


def slide_problem(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "The problem", "Sensitive operations speed up. Proof does not.")
    w = base.Inches(4.15)
    y = base.Inches(2.35)
    h = base.Inches(2.55)
    base.add_round_card(slide, base.MARGIN_L, y, w, h)
    base.write_text(
        slide, base.MARGIN_L + base.Inches(0.18), y + base.Inches(0.18), w - base.Inches(0.3),
        base.Inches(0.35), "Banking", size=12, bold=True, color=base.TEAL,
    )
    base.write_bullets(
        slide, base.MARGIN_L + base.Inches(0.18), y + base.Inches(0.55), w - base.Inches(0.3),
        base.Inches(1.8),
        ["Outbound payment above threshold", "Limit or account status change", "KYC / AML validation", "Payment or settlement order"],
        size=11, color=base.MUTED,
    )
    x2 = base.MARGIN_L + w + base.Inches(0.25)
    base.add_round_card(slide, x2, y, w, h)
    base.write_text(
        slide, x2 + base.Inches(0.18), y + base.Inches(0.18), w - base.Inches(0.3),
        base.Inches(0.35), "Insurance", size=12, bold=True, color=base.TEAL,
    )
    base.write_bullets(
        slide, x2 + base.Inches(0.18), y + base.Inches(0.55), w - base.Inches(0.3), base.Inches(1.8),
        ["Claim settlement or disbursement", "Coverage or premium change in production", "High-value policy open or close", "Regulatory or partner reporting"],
        size=11, color=base.MUTED,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.2), base.CONTENT_W, base.Inches(0.9),
        "When audit asks who approved what, application logs and tickets are not enough. "
        "You need one chain: rule, human decision if required, execution, verifiable timestamp.",
        size=12, color=base.MUTED,
    )


def slide_systems_ok(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Your systems work",
        "Not a fix for outages. Governance for what comes next.",
    )
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.5),
        [
            "If everything runs well today, good. Aegis is not an incident patch",
            "The question is tomorrow: AI copilot, business scripts, orchestration. Who authorizes before the core executes?",
            "A stable system with no signed approval register means audit rebuilt in weeks, not hours",
            "You gain: say yes to automation projects because proof exists before the next review",
        ],
        size=13,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.85), base.CONTENT_W, base.Inches(0.55),
        "You are ahead on stability. Aegis is the layer that lets you add AI and automation without betting the institution.",
        size=12, color=base.TEAL, bold=True,
    )
    base.add_notes(slide, "Never say their system is broken. Validate stability. Sell the future layer.")


def slide_what_you_gain(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "What you gain", "Speed and audit-ready proof together")
    cards = [
        ("Move faster with confidence", "Automation no longer blocked by the risk committee by default"),
        ("Answer audit quickly", "Signed trace and export in hours, not weeks of reconstruction"),
        ("Clear accountability", "Named approver, rule applied, full history"),
        ("Concrete deployment", "One critical workflow in 4 to 8 weeks, measurable outcome"),
    ]
    w = base.Inches(2.05)
    gap = base.Inches(0.18)
    y = base.Inches(2.45)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(cards):
        x = base.MARGIN_L + i * (w + gap)
        base.add_round_card(slide, x, y, w, h)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.18), w - base.Inches(0.25), base.Inches(0.55), head, size=12, bold=True, color=base.TEAL)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.78), w - base.Inches(0.25), base.Inches(1.4), body, size=11, color=base.MUTED)


def slide_governed_automation(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Governed automation",
        "One offer: automate and govern every sensitive step",
    )
    cols = [
        ("Automation only", "Fast, but blind and risky"),
        ("Governance only", "Safe, but slow and hard to scale"),
        ("Salanor Aegis", "Rules + approval + signed trace on the workflow you automate"),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.55)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(cols):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        accent = base.TEAL if i == 2 else base.MUTED
        base.write_text(slide, x + base.Inches(0.18), y + base.Inches(0.22), w - base.Inches(0.3), base.Inches(0.55), head, size=12, bold=True, color=accent)
        base.write_text(slide, x + base.Inches(0.18), y + base.Inches(0.85), w - base.Inches(0.3), base.Inches(1.2), body, size=11, color=base.MUTED)
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.35), base.CONTENT_W, base.Inches(0.55),
        "Salanor can integrate n8n, your APIs, and internal scripts. Aegis governs every sensitive action from day one.",
        size=12, color=base.MUTED,
    )


def slide_positioning(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Positioning", "Where Aegis sits in your stack")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.5),
        [
            "Aegis sits before a sensitive action executes: rule, named approval if needed, signed register",
            "Not core banking, AML engine, or SIEM. You keep your business systems",
            "Governance and proof layer around your flows: API, orchestration, internal scripts",
            "Production: BYOK (private key stays with you). Orchestrator (n8n): Workflow Bridge with no private key in the tool",
        ],
        size=13,
    )


def slide_what_you_deploy(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "What you deploy", "Operational solution, not an R&D project")
    rows = [
        ("You keep", "Core banking, claims system, SIEM, AML, your teams, your processes"),
        ("Salanor adds", "Rules before sensitive actions, named approval, alerts, signed trace, audit export"),
        ("Integration", "n8n, Make, HTTP, TypeScript / Python / Go SDK, open APS-1 format"),
        ("Keys", "BYOK in production. Orchestrator bridge for a fast pilot"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.78))
        base.write_text(slide, base.MARGIN_L + base.Inches(0.18), base.Inches(y + 0.12), base.Inches(1.55), base.Inches(0.28), head, size=11, bold=True, color=base.TEAL)
        base.write_text(slide, base.MARGIN_L + base.Inches(1.85), base.Inches(y + 0.14), base.Inches(6.5), base.Inches(0.55), body, size=12, color=base.MUTED)
        y += 0.88
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.05), base.CONTENT_W, base.Inches(0.45),
        "Deploy on one critical workflow in 4 to 8 weeks. Success = your audit team validates the proof without Salanor in the room.",
        size=12, color=base.WHITE, bold=True,
    )


def slide_client_limits(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Limits and rules per client",
        "Today, next with you, risk scoring on your data if you want it",
    )
    phases = [
        ("Today (shipped)", [
            "Thresholds by amount and action type (e.g. payment > X requires approval)",
            "Full client context visible to approver: account, beneficiary, segment",
            "Multiple active policies in parallel",
        ]),
        ("Phase 2 (deployment)", [
            "Rules by client segment, account type, beneficiary lists",
            "Your core banking fields in the rule condition",
        ]),
        ("Phase 3 (optional)", [
            "Risk model on your data to recommend limit per client",
            "Scoring stays with you or is built in scoping with your risk team",
        ]),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.35)
    h = base.Inches(3.15)
    for i, (head, bullets) in enumerate(phases):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(slide, x + base.Inches(0.15), y + base.Inches(0.15), w - base.Inches(0.25), base.Inches(0.45), head, size=11, bold=True, color=base.TEAL)
        base.write_bullets(slide, x + base.Inches(0.15), y + base.Inches(0.62), w - base.Inches(0.25), base.Inches(2.35), bullets, size=10, color=base.MUTED)
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.75), base.CONTENT_W, base.Inches(0.75),
        "We do not claim to have your risk model today. We provide the execution and proof layer. "
        "Per-client customization is mapped with your payment and risk teams during deployment.",
        size=11, color=base.MUTED,
    )


def slide_how_it_works(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "How it works", "Four steps, one chain of proof")
    steps = [
        ("01", "Connect", "n8n, SDK, or APS-1 format"),
        ("02", "Apply rules", "Allow, block, or require approval"),
        ("03", "Record", "Signed register, witness batches"),
        ("04", "Export", "Console, verification, audit bundle"),
    ]
    w = base.Inches(2.05)
    y = base.Inches(2.55)
    h = base.Inches(2.35)
    for i, (num, head, body) in enumerate(steps):
        x = base.MARGIN_L + i * (w + base.Inches(0.18))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(slide, x + base.Inches(0.12), y + base.Inches(0.15), base.Inches(0.4), base.Inches(0.25), num, size=11, bold=True, color=base.TEAL)
        base.write_text(slide, x + base.Inches(0.12), y + base.Inches(0.45), w - base.Inches(0.2), base.Inches(0.35), head, size=12, bold=True)
        base.write_text(slide, x + base.Inches(0.12), y + base.Inches(0.85), w - base.Inches(0.2), base.Inches(1.3), body, size=10, color=base.MUTED)


def slide_demo(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Demonstration", "Bank scenario: outbound payment above limit")
    base.add_round_card(slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.35))
    base.write_text(
        slide, base.MARGIN_L + base.Inches(0.25), base.Inches(2.55), base.Inches(8.0), base.Inches(0.45),
        "Case: workflow attempts a USD 2,500 payment. Rule: above USD 1,000 requires human approval.",
        size=13, bold=True,
    )
    base.write_bullets(
        slide, base.MARGIN_L + base.Inches(0.25), base.Inches(3.05), base.Inches(8.0), base.Inches(2.4),
        [
            "Without governance: payment goes when the workflow runs",
            "With Aegis: workflow stops. Approver sees amount, beneficiary, context",
            "No approval: no payment. Every step recorded and signed",
            "Same pattern for claims, KYC, limit changes",
        ],
        size=12,
    )
    base.write_text(slide, base.MARGIN_L, base.Inches(6.0), base.CONTENT_W, base.Inches(0.35), "Console: app.salanor.com", size=11, color=base.DIM)


def slide_approval_audit(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Approval and audit", "Who signed, not just what happened")
    base.write_bullets(
        slide, base.MARGIN_L, base.Inches(2.35), base.Inches(4.4), base.Inches(3.5),
        [
            "Alerts: email, Slack, PagerDuty, SMS",
            "Named approver, timestamp, single trace",
            "Refusal or timeout: action does not execute",
            "Full history with the rule that applied",
        ],
        size=12,
    )
    base.add_round_card(slide, base.Inches(5.15), base.Inches(2.35), base.Inches(3.95), base.Inches(2.8))
    base.write_text(slide, base.Inches(5.35), base.Inches(2.55), base.Inches(3.55), base.Inches(0.35), "Audit exports", size=12, bold=True, color=base.TEAL)
    base.write_bullets(
        slide, base.Inches(5.35), base.Inches(2.95), base.Inches(3.55), base.Inches(2.0),
        [
            "Bundle by period, integrity hash",
            "POPIA accountability, SOC 2 and EU AI Act control mapping (doc aid, not Salanor certification)",
            "Step-by-step replay in the console",
        ],
        size=11, color=base.MUTED,
    )
    base.add_notes(slide, "For South Africa: POPIA accountability is easier with a verifiable record than email trails.")


def slide_offer(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Deployment offer", "4 to 8 weeks · one workflow · proof your audit accepts")
    rows = [
        ("Scope", "One process: payment, claim, KYC, limit change"),
        ("Delivered", "Rules, approvals, active register, console training, audit export"),
        ("Platform", "Team tier from USD 299 / month"),
        ("Setup", "Fixed fee by integration complexity"),
        ("Success", "Sensitive operation approved by a named human, verifiable by your risk or audit team"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.72))
        base.write_text(slide, base.MARGIN_L + base.Inches(0.2), base.Inches(y + 0.12), base.Inches(1.4), base.Inches(0.28), head, size=11, bold=True, color=base.TEAL)
        base.write_text(slide, base.MARGIN_L + base.Inches(1.75), base.Inches(y + 0.14), base.Inches(6.5), base.Inches(0.45), body, size=12, color=base.MUTED)
        y += 0.82


def slide_next_step(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Next step",
        "Questions, a concrete use case, or want to see more? Book a call.",
    )
    options = [
        ("15 minutes", "Short intro, Q&A, console preview or live demo"),
        ("45 minutes", "Scoping with ops, risk, or IT: one workflow, rules, approvers, success criteria"),
        ("On request", "Sample audit export, one-pager, or demo on a bank / insurance scenario"),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.45)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(options):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(slide, x + base.Inches(0.18), y + base.Inches(0.22), w - base.Inches(0.3), base.Inches(0.45), head, size=13, bold=True, color=base.TEAL)
        base.write_text(slide, x + base.Inches(0.18), y + base.Inches(0.72), w - base.Inches(0.3), base.Inches(1.45), body, size=11, color=base.MUTED)
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.15), base.CONTENT_W, base.Inches(0.55),
        "Email me directly. If someone introduced you, they can help set up the call. "
        "We agree a scope if deployment makes sense for you.",
        size=12, color=base.MUTED,
    )
    base.write_text(
        slide, base.MARGIN_L, base.Inches(5.85), base.CONTENT_W, base.Inches(0.45),
        "contact@salanor.com · partners@salanor.com · app.salanor.com",
        size=13, color=base.WHITE, bold=True,
    )


def slide_contact(prs) -> None:
    slide = base.blank(prs)
    base.add_rect(slide, base.Inches(0), base.Inches(7.44), base.Inches(10), base.Inches(0.06), base.TEAL_DIM)
    base.write_text(slide, base.MARGIN_L, base.Inches(0.55), base.CONTENT_W, base.Inches(0.28), "CONTACT", size=9, color=base.TEAL, bold=True)
    base.write_text(slide, base.MARGIN_L, base.Inches(1.05), base.CONTENT_W, base.Inches(0.55), "Salanor Ltd", size=28, bold=True)
    lines = [
        "Landry Bougang Fotso · Founder · Kigali, Rwanda",
        "",
        "www.salanor.com",
        "www.salanor.com/products/aegis",
        "app.salanor.com",
        "",
        "contact@salanor.com · partners@salanor.com",
    ]
    y = 1.85
    for line in lines:
        if line:
            base.write_text(
                slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.35), line,
                size=13, color=base.MUTED if "@" in line or "www" in line else base.WHITE,
            )
        y += 0.42 if line else 0.2
    base.write_text(
        slide, base.MARGIN_L, base.Inches(6.5), base.CONTENT_W, base.Inches(0.3),
        "Governed automation · Finance and insurance · Confidential",
        size=9, color=base.DIM,
    )


def build() -> Path:
    prs = base.Presentation()
    prs.slide_width = base.Inches(10)
    prs.slide_height = base.Inches(7.5)

    slide_title(prs)
    slide_why_now(prs)
    slide_problem(prs)
    slide_systems_ok(prs)
    slide_what_you_gain(prs)
    slide_governed_automation(prs)
    slide_positioning(prs)
    slide_what_you_deploy(prs)
    slide_client_limits(prs)
    slide_how_it_works(prs)
    slide_demo(prs)
    slide_approval_audit(prs)
    slide_offer(prs)
    slide_next_step(prs)
    slide_contact(prs)

    OUT_REPO.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT_REPO))

    OUT_SA.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_REPO, OUT_SA)

    return OUT_REPO


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path}")
    print(f"Copied to {OUT_SA}")
