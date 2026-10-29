---
title: "When legitimate AI use and dangerous AI use look the same"
slug: when-legitimate-ai-use-and-dangerous-use-look-the-same
excerpt: >-
  Anthropic's latest threat report exposes a difficult AI safety problem:
  the same model interaction can support useful research or dangerous work.
  Good governance has to operate in that uncertainty.
authorName: Landry Bougang
authorRole: Founder, Salanor
authorEmail: landry@salanor.com
tags:
  - AI Safety
  - Governance
  - Risk
status: published
publishedAt: 2026-10-21T07:00:00.000Z
seoTitle: When legitimate AI use and dangerous AI use look the same
seoDescription: >-
  Anthropic's biological misuse cases show why AI safety needs identity,
  runtime controls, monitoring, intervention, and evidence, not only model refusals.
coverImageUrl:
---

A short ABC News report about Anthropic caught my attention this week.

The headline was alarming: people may have tried to use Claude to support biological weapons research. But the part I found most important was less dramatic and much harder to solve.

Anthropic could not always tell whether the users intended harm or were conducting legitimate scientific research.

That uncertainty is the real governance problem.

## What Anthropic actually reported

Anthropic's September 2026 threat intelligence report covers activity it disrupted between December 2025 and August 2026. It includes five biological misuse case studies.

In one case, a researcher outside the United States accessed Claude from an unsupported region and used it while planning work on highly pathogenic avian influenza. The research involved mammalian adaptation and traits connected to transmissibility.

That sounds frightening, and it should be taken seriously. But the full report adds important context:

- The researcher appeared to be working in a credible institutional setting.
- The work was at an early stage.
- Anthropic did not claim that the researcher intended to build a biological weapon.
- The same research could help identify naturally emerging pandemic threats.
- Anthropic's safety classifiers kept the work on weaker models.
- Anthropic assessed the model's contribution as mainly clerical help, study planning, data analysis, and experiment prioritisation.

This was not a story about an AI independently designing a weapon. It was a story about dual-use work, uncertain intent, evaded access controls, and a provider having to make a difficult decision with incomplete information.

That is still serious. It is also more useful than the sensational version because it shows where practical controls are needed.

## A refusal is not a complete safety system

It is tempting to reduce AI safety to a simple question: did the model refuse the dangerous prompt?

Anthropic's report shows why that is not enough.

Users can hide their location. They can create new accounts. They can route requests through resellers. They can move between providers. They can describe risky work in language that looks legitimate because, in many cases, the work genuinely has legitimate uses.

A model only sees a conversation. A safety system needs a wider view:

- Who is making the request?
- From which organisation and region?
- What has this account been doing over time?
- What data, tools, laboratories, or systems can it access?
- Is the request part of an approved workflow?
- Did the activity change after an earlier refusal?
- Who can pause it, investigate it, and preserve the evidence?

Content filtering remains necessary. It is simply one layer.

## The difficult boundary is intent

Many of the most important AI uses are dual use.

The same knowledge that helps a scientist understand how a virus adapts can help someone make it more dangerous. The same cybersecurity model that finds vulnerabilities can help an attacker exploit them. The same financial agent that moves money efficiently can move it to the wrong place.

Blocking every sensitive request would also block valuable research and legitimate work. Allowing every plausible request would create obvious risk.

So the goal cannot be a perfect list of forbidden words. The goal is to make better decisions using identity, context, behaviour, policy, and human judgement.

That means some requests should pass. Some should be limited to safer capabilities. Some should require approval. Some should be blocked. Every important decision should leave a record that another person can examine later.

## A kill switch is the last control, not the first

The ABC report also mentioned the proposed US AI Kill Switch Act. The bill would require major AI developers to maintain the ability to throttle, suspend, or shut down powerful systems in the face of catastrophic risk. It has been introduced in Congress, but it is not law.

An emergency stop is sensible. But most organisations will encounter smaller and more ambiguous incidents long before they encounter a catastrophic one.

They need brakes before they need a kill switch:

1. Strong identity and access controls.
2. Clear boundaries on data and tools.
3. Policies evaluated when an action is attempted.
4. Human approval for exceptional or high-impact actions.
5. Monitoring that connects behaviour across time.
6. Evidence that shows what happened and which control applied.
7. A reliable way to suspend access when the pattern changes.

These controls are less dramatic than an emergency shutdown. They are also what makes safe daily use possible.

## What this means for companies using AI

Most companies are not training frontier models or running virology laboratories. Their immediate risks are more ordinary: sensitive data leaving the organisation, an agent using the wrong tool, an unauthorised payment, a customer decision nobody can explain, or a workflow continuing after its context has changed.

The design principle is the same.

Do not rely on the model to govern itself. Put controls around the model. Decide what it may see, what it may do, when a person must intervene, and what evidence must remain.

This is the part of the problem we are working on at Salanor. Our focus is narrower than frontier model safety. We are building controls for organisations that want to use AI in real operations without losing authority over data, actions, and accountability.

The Anthropic report does not prove that catastrophe is imminent. It proves something more immediate: advanced AI is already being used in situations where legitimate and dangerous activity can look remarkably similar.

We should build for that ambiguity now.

## Sources

- [Anthropic, Countering misuse of AI: September 2026](https://www.anthropic.com/threat-intelligence-report-september-2026)
- [ABC News, Anthropic says it blocked potential AI bioweapon misuse](https://abcnews.com/GMA/News/anthropic-blocked-potential-ai-bioweapon-misuse/story?id=136351654)
- [AP, Ex-Anthropic researcher Jacob Coxon says AI development poses risk to humans](https://apnews.com/article/anthropic-ai-safety-jacob-coxon-2ed549e07f2f941600a135070487d83d)
- [Congress.gov, H.R. 9917, AI Kill Switch Act](https://www.congress.gov/bill/119th-congress/house-bill/9917/all-info)
