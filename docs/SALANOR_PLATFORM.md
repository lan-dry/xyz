# Salanor Platform — Master Documentation

**Version:** 1.0  
**Date:** May 2026  
**Status:** Design & strategic reference  
**Owner:** Salanor (Founder)

---

## 1. Purpose of this document

This document defines the **Salanor platform** as a **technology company** with multiple product lines—not a single-product environmental startup.

Use it to:

- Design the public web presence (`salanor.com` and product subsites)
- Align messaging for investors, accelerators, partners, and hires
- Scope product lines without letting one product overshadow the company
- Plan phased delivery per product (without prescribing implementation technologies)

---

## 2. Company vision

### 2.1 Who we are

**Salanor** is a technology company that builds **focused products** where data, intelligence, and automation must be **trustworthy, explainable, and accountable**.

We innovate across domains where mistakes are costly—environment, financial operations, and autonomous software—under one company committed to **evidence-based decisions** and **human oversight**.

### 2.2 Mission

To turn complex, high-risk information into **decisions people can defend**—with clear provenance, auditability, and measurable outcomes.

### 2.3 Long-term ambition

Salanor aims to become a **durable, global innovator**: a company known for shipping serious products, not slogans; for operating from Africa while serving the world; and for proving that ambitious, multi-domain innovation can be built with discipline and transparency.

### 2.4 What we believe

1. **Evidence over hype** — Claims must be traceable to sources, data, or recorded actions.  
2. **Human accountability** — Automation assists; people remain responsible for outcomes.  
3. **Narrow products, honest phases** — We ship one workflow at a time and say what is live vs in research.  
4. **Privacy and security by design** — Collect only what is needed; be explicit about retention and access.  
5. **Global relevance** — Problems and customers are worldwide; our base is an advantage, not a limit.

### 2.5 What Salanor is not

- Not defined by a single product (e.g. air quality only)  
- Not a vague “AI consultancy” without shipped products  
- Not a conglomerate pretending five equal bets at once  
- Not a company that overpromises compliance, legal, or insurance outcomes before they exist

---

## 3. Brand architecture

### 3.1 Model: branded house

```
                         SALANOR
                    (the company)
                           |
         +-----------------+-----------------+
         |                 |                 |
      AETHER             AEGIS         [Future lines]
   Environment        Agent trust      as validated
```

| Level | Name | Role |
|-------|------|------|
| **Company** | Salanor | Identity, trust, careers, investment narrative, shared policies |
| **Product lines** | Aether, Aegis, … | Named innovations with their own story, site, and roadmap |
| **Phases** | e.g. Aegis Phase 0 | Honest scope labels inside a product line |

### 3.2 Naming in public communication

- **Correct:** “Aegis by Salanor,” “Salanor’s Aether program,” “Salanor builds …”  
- **Avoid:** Describing Salanor only as an environmental or air-quality company on the corporate homepage  
- **Trademark note:** Reinforce **Salanor** as the parent brand; evaluate product names with counsel before major spend.

### 3.3 Company tagline (options)

Primary recommendation:

> **Trusted systems from data.**

Alternatives:

> **Applied intelligence for high-stakes decisions.**  
> **Evidence. Accountability. Innovation.**

---

## 4. Product portfolio

### 4.1 Portfolio at a glance

| Product | Domain | Primary audience | Commercial focus | Public site |
|---------|--------|------------------|------------------|-------------|
| **Aegis** | Accountability for AI agents and automated actions | Developers and teams shipping agents; later security and compliance leaders | **Active** — primary company focus (near term) | `aegis.salanor.com` |
| **Aether** | Environmental intelligence for planning and health | Cities, researchers, NGOs, industrial partners (pilots) | **Program** — partner-led; honest about GTM learnings | `aether.salanor.com` |
| **Future lines** | TBD (e.g. electronics, services, other data systems) | TBD | **R&D** — only promoted when scoped | — |

**Operating rule:** One product is the **primary commercial focus** per quarter. Others remain visible with accurate status—not hidden, not falsely equal.

### 4.2 Product: Aether

**One line**  
Hyperlocal environmental intelligence for better decisions on infrastructure and public health.

**Problem**  
Rapidly growing cities and organizations often lack **trusted, timely, local** environmental data to plan infrastructure, research exposure, and protect health.

**What Aether is**  
A Salanor product line for **environmental data and intelligence**—sensing, fusion with other sources, analytics, and interfaces for planners and researchers.

**Current status (transparent)**  
- Mission and technical work remain important to Salanor.  
- **Commercial scale** through municipal procurement alone has proven slow relative to runway.  
- Aether continues as a **program** seeking partners, grants, or pilot funding—not as the company’s sole public identity.

**Capabilities (vision)**  
- Environmental monitoring and data layers  
- Dashboards and APIs for decision-makers  
- Support for urban planning, research, and public-health-oriented use cases  

**What we do not claim**  
- City-wide deployment without funded partners  
- Replacement for national regulatory monitoring networks  

**Calls to action**  
- Partner with us on a pilot  
- Research collaboration  
- Contact for grant-aligned projects  

---

### 4.3 Product: Aegis

**One line**  
Forensics and accountability for AI agents—see what ran, replay it, catch dangerous patterns before they spread.

**Problem**  
Organizations want to deploy **autonomous agents** (tools, APIs, workflows), but legal, security, and operations teams block or slow rollout because:

- There is no clear record of **which agent** did **what**, **when**, and **why**  
- Debugging production failures is painful  
- Policy and audit requirements (e.g. emerging AI regulation) demand **traceability** and **human oversight**

**What Aegis is (today — Phase 0)**  
The **first shippable layer** of a longer trust roadmap:

- Capture agent runs (tool calls, steps, outcomes)  
- Store runs in a reviewable form  
- Replay and inspect a run end-to-end  
- Flag suspicious patterns (e.g. loops, repeated failures, abnormal cost or volume)  
- Keep humans in the loop—Aegis supports accountability; it does not replace it  

**What Aegis is (roadmap — later phases)**  
Internal north star includes stronger integrity guarantees, policy enforcement, cross-system identity, and enterprise governance—**only marketed when delivered**.

**Positioning**  
- **Developer-first** entry: fast to try, local-friendly where possible  
- **Framework-aware** but not locked to one vendor’s cloud  
- **Narrow and honest** in Phase 0 vs generic “AI safety platform” claims  

**Public promise (Phase 0)**  
> *Know what your agent did—step by step.*

**Out of scope in Phase 0 public messaging**  
- Court-admissible or legal-grade certifications  
- Insurance underwriting or premium pricing  
- Full enterprise policy engine or kill-switch platform  
- Claims of “zero code change” or guaranteed regulatory compliance  

**Calls to action**  
- Install / try the SDK  
- View documentation and examples  
- Request design-partner or team access (as tiers launch)  

---

### 4.4 Future product lines

Salanor may expand into **electronics, consulting, or other data-intensive products** when:

- A specific problem is validated with buyers or partners  
- The line does not dilute the company’s primary commercial focus for that period  

Future lines get a **name, subsite, and status** (R&D / Pilot / Active)—not automatic homepage equality.

---

## 5. Digital platform — information architecture

### 5.1 Domain structure

| URL | Purpose |
|-----|---------|
| `https://salanor.com` | Corporate home: vision, products, about, contact |
| `https://aegis.salanor.com` | Aegis product: value prop, docs, install, updates |
| `https://aether.salanor.com` | Aether program: mission, status, partners |
| `https://app.aegis.salanor.com` | *(When ready)* Team dashboard / cloud product |
| `https://docs.aegis.salanor.com` | Documentation subdomain (rewrites to `/aegis/docs` in `apps/web`) |

**Local dev (implemented):** `aegis.localhost` and `docs.aegis.localhost` → same rewrites as production hosts (`/aegis/*`). See `docs/LOCAL_DEV.md`.

**Email (recommended)**  
- `hello@salanor.com` — general  
- `security@salanor.com` — security disclosures  
- Product-specific addresses later (e.g. `aegis@salanor.com`)

### 5.2 Site map — salanor.com (company)

```
/                     Home — company vision & product grid
/products             All product lines with status badges
/about                Mission, principles, team, story
/research             Optional: publications, open initiatives
/careers              Future roles
/contact              Form, locations, social links
/legal                Privacy policy, terms of use
```

### 5.3 Site map — aegis.salanor.com

```
/                     Product home — promise, demo, get started
/docs                 Quickstart, concepts, reference (grows over time)
/pricing              Tiers when defined (or “coming soon” honestly)
/changelog            Release notes
/security             Data handling, retention, subprocessors (as applicable)
```

### 5.4 Site map — aether.salanor.com

```
/                     Program overview & current status
/approach             How we think about data and impact
/partners             Pilot and partnership CTA
/updates              News or blog (optional)
```

### 5.5 Homepage content hierarchy (design brief)

**Order of message (top to bottom):**

1. **Company hero** — Salanor builds trustworthy data and automation products for high-stakes domains.  
2. **Product grid** — Aegis (Active) · Aether (Program) · Future (R&D).  
3. **Principles strip** — Evidence, human accountability, phased honesty.  
4. **Proof** — Only real metrics: pilots, partners, open-source activity, testimonials.  
5. **Founder / company story** — Global ambition, based in Africa, building for the world.  
6. **Primary CTA** — Try Aegis / Contact Salanor / Partner on Aether.

**Never:** Lead with air quality only, or imply all products are equally mature.

---

## 6. Visual and verbal identity (design brief)

### 6.1 Voice and tone

- **Confident, clear, calm** — no hype, no fear-mongering  
- **Technical credibility** without unnecessary jargon  
- **Honest status labels:** Active · Program · R&D  
- **Inclusive global audience** — English-first; localize later if needed  

### 6.2 Visual direction (non-prescriptive)

- Modern, minimal, generous whitespace  
- Consistent header/footer linking back to Salanor on all subsites  
- Distinct but related treatment per product (Aether: environment/data; Aegis: traces/timelines)  
- Avoid generic stock “corporate handshake” imagery; prefer abstract data, maps, or product UI  

### 6.3 Shared navigation pattern

**Header (all sites):**  
Salanor logo → Products (dropdown: Aegis, Aether) → About → Contact → Product CTA (contextual)

**Footer (all sites):**  
© Salanor · Products · Privacy · Contact · Social

---

## 7. Platform architecture (conceptual)

*This section describes **layers and responsibilities**, not implementation choices.*

```
┌──────────────────────────────────────────────────────────────┐
│  CORPORATE PRESENCE                                          │
│  Company story, product discovery, legal, contact            │
│  salanor.com                                                 │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  AEGIS PRODUCT         │     │  AETHER PRODUCT         │
│  Capture → review →     │     │  Sense → fuse →         │
│  alert → (later govern) │     │  inform → partner APIs  │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  Phase 0: local /       │     │  Pilots & partners;     │
│  self-serve adoption    │     │  funded deployments     │
│  Phase 1+: team cloud   │     │                         │
└─────────────────────────┘     └─────────────────────────┘
```

### 7.1 Shared platform concerns (company-level)

- Unified privacy policy and legal pages  
- Shared brand assets and design system  
- Security contact and responsible disclosure process  
- Central analytics and contact routing (proportionate to stage)  
- Single GitHub organization (or equivalent) for open initiatives  

### 7.2 Aegis — capability phases (product)

| Phase | User value | Audience |
|-------|------------|----------|
| **Phase 0** | Record, replay, and flag agent runs; local-friendly adoption | Individual developers, small teams |
| **Phase 1** | Team retention, sharing, alerts, accounts | Growing teams, startups |
| **Phase 2+** | Policy, stronger integrity, enterprise exports, integrations | Regulated enterprises |

### 7.3 Aether — capability phases (product)

| Phase | User value | Audience |
|-------|------------|----------|
| **Program** | Vision, prototypes, partner conversations | NGOs, cities, researchers |
| **Pilot** | Defined deployment with funded partner | Named geographies or sites |
| **Scale** | Sustained data product + revenue model | Only with proven unit economics |

---

## 8. Data, security, and trust (company policy)

### 8.1 Principles

- **Minimize** sensitive data collection  
- **Default:** no training on customer data unless explicitly agreed  
- **Transparency** on what is stored, where, and for how long  
- **Human review** for high-stakes outputs where applicable  

### 8.2 Product-specific posture

| Product | Typical sensitive data | Phase 0 stance |
|---------|------------------------|----------------|
| Aegis | Prompts, tool payloads, credentials in traces | Prefer local processing; redact secrets in logs |
| Aether | Location, environmental readings, partner data | Governed by pilot agreements |

### 8.3 Public pages to maintain

- Company privacy policy (`salanor.com/legal`)  
- Product security overview (Aegis when cloud exists)  
- Data processing summary for teams evaluating pilots  

---

## 9. Go-to-market and narrative

### 9.1 Company elevator pitch

> **Salanor** builds products where data and automation must be trustworthy—from environmental intelligence to agent accountability. We’re focused on shipping **Aegis** for teams running AI agents in production, while **Aether** advances through partners and funded pilots.

### 9.2 Investor / accelerator narrative

1. **Company:** Salanor — multi-product tech company, disciplined focus  
2. **Insight:** High-stakes domains need evidence and audit trails, not black boxes  
3. **Now:** Aegis Phase 0 — demonstrable product, developer adoption path  
4. **Portfolio:** Aether — mission retained, commercial path honest  
5. **Ask:** Intros, design partners, pre-seed / program support — tied to real milestones  

### 9.3 Transparent pivot language (template)

> We invested [time] in **Aether** and confirmed the environmental need is real. Our bottleneck was **buyer speed and deployment economics**, not the mission. **Salanor** remains committed to Aether as a program. Our **near-term commercial focus** is **Aegis**, applying the same principles—evidence and accountability—to AI agents, where teams feel urgency today.

### 9.4 Social and founder presence

- **LinkedIn headline:** Founder, **Salanor** (not “air quality startup” only)  
- **Pinned post:** Company thesis + two products + current focus  
- **Product posts:** Label Aegis or Aether in the first line  

---

## 10. Roadmap (company level)

| Period | Salanor (company) | Aegis | Aether |
|--------|-------------------|--------|--------|
| **Current quarter** | Rebrand to multi-product company; clear web IA | Ship Phase 0; public launch; design partners | Maintain program page; partner outreach |
| **Next 2 quarters** | First revenue milestone; refine brand proof | Team tier; cloud retention | Pilot only if funded |
| **12+ months** | Optional second product or scale Aegis | Governance features as validated | Scale if economics work |

---

## 11. Success metrics

| Metric | Owner | Notes |
|--------|-------|-------|
| Corporate site clarity (bounce, time on /products) | Marketing | Qualitative UX reviews count early |
| Aegis: active installations / weekly users | Product | Honest adoption |
| Aegis: design partners or paid pilots | CEO | Revenue learning |
| Aether: qualified partner conversations | Aether lead | Not vanity press |
| Inbound investor / accelerator interest | CEO | Track intros and follow-ups |

---

## 12. Design deliverables checklist

- [ ] Salanor wordmark and brand guidelines  
- [ ] Aegis and Aether sub-brand marks (optional icons)  
- [ ] Corporate homepage wireframe (company-first)  
- [ ] Product page wireframes (Aegis, Aether)  
- [ ] Status badge system: Active · Program · R&D  
- [ ] Slide template: Salanor cover + product divider slides  
- [ ] Social banner kit (company + products)  

---

## 13. Governance and intellectual property

- Product IP should reside with **Salanor** (or the incorporated entity) via founder assignment when formalized  
- Open-source components (e.g. Aegis SDK) should use an explicit license chosen before public launch  
- Trademark strategy: prioritize **Salanor**; evaluate product names with counsel before major spend  

---

## 14. Document control

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | May 2026 | Initial platform documentation (vision-first; no technology stack) |

**Next review:** After corporate site redesign and Aegis Phase 0 public launch.

---

## Appendix A — Homepage product card copy

**Aegis** · `Active`  
Forensics for AI agents—trace, replay, and catch runaway behavior.  
→ Explore at aegis.salanor.com

**Aether** · `Program`  
Environmental intelligence for cities and research partners.  
→ Learn more at aether.salanor.com

**More from Salanor** · `R&D`  
New lines emerge when validated—follow Salanor for updates.

---

## Appendix B — Corporate homepage hero (draft)

**Headline:**  
Trusted systems from data.

**Subhead:**  
Salanor builds focused products where evidence and accountability matter—from environmental intelligence to AI agent forensics.

**CTA pair:**  
[Explore Aegis] · [Contact Salanor]

---

*End of document*
