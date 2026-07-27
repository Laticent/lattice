---
marp: true
size: 16:9
theme: indaco
paginate: true
acronyms:
  TCO: total cost of ownership
  II: two
---

<!-- _class: title silent spectrum -->

# From Remembering to Creating

`A Cognitive Framework for Engineering Growth`

A level-guided journey for software engineers.

---

<!-- _class: quote bare -->
<!-- _footer: "Hook · quote bare" -->

> The difference between a senior engineer and a staff engineer isn't what they ship — it's how they think about what to ship.

*The question this framework answers*

---

<!-- _class: premise -->
<!-- _footer: "Premise · premise" -->

## Growth is a change in thinking, not title.

Six cognitive verbs map the questions an engineer learns to ask — your level is the highest verb you reliably own, and how far that thinking travels.

- `01` **Remember** Recall facts, syntax, rules. *How is this done?*
- `02` **Understand** Explain behavior and dependencies. *Why does it work?*
- `03` **Apply** Use patterns in new contexts. *How do I make it work here?*
- `04` **Analyze** Decompose across boundaries. *Where does it break?*
- `05` **Evaluate** Judge options against strategy. *Which option should win?*
- `06` **Create** Synthesize what isn't there. *What should exist?*

---

<!-- _class: split-panel proof cat-1 -->
<!-- _footer: "Level 1 · split-panel proof cat-1" -->

`Level 1 · Remembering`

## Execute with accuracy.

*How is this done?* You recall syntax, patterns, and standards — the path is known, and the job is to follow it without error.

### You know you're here when

You implement a feature via an existing API. Tests pass, review comes back clean, and rework is rare.

- Follows examples well
  - Compiles, runs, and tests locally with confidence.
- Works from brief tickets
  - Consistent quality without hand-holding.

---

<!-- _class: split-panel proof cat-2 -->
<!-- _footer: "Level 2 · split-panel proof cat-2" -->

`Level 2 · Understanding`

## Explain the why behind the what.

*Why does it work?* You read the system, trace the flow, and explain failure modes — changes you make no longer surprise anyone at integration time.

### You know you're here when

You trace a request end-to-end, pinpoint a bottleneck, and explain the tradeoff between two fixes to a peer.

- Draws the flow
  - Reads code you didn't write and explains failure modes clearly.
- Documents assumptions
  - Proposes a small improvement and ships it safely.

---

<!-- _class: split-panel proof cat-3 -->
<!-- _footer: "Level 3 · split-panel proof cat-3" -->

`Level 3 · Applying`

## Own the outcome end-to-end.

*How do I make it work here?* You use known patterns in new contexts, shipping features with reliability, observability, and on-call readiness.

### You know you're here when

You design and deliver a scalable microservice with CI/CD, SLOs, and runbooks — and you carry the pager.

- Delivers end-to-end
  - Meets SLOs, on-call ready and effective.
- Adapts the pattern
  - Fits a standard pattern to a novel domain constraint.

---

<!-- _class: split-panel proof cat-4 -->
<!-- _footer: "Level 4 · split-panel proof cat-4" -->

`Level 4 · Analyzing`

## See the system, not just the service.

*Where does it break?* You decompose complexity across boundaries — when something breaks between services, you find the root cause.

### You know you're here when

You re-architect a data pipeline to resolve distributed latency that three teams couldn't isolate independently.

- Finds root causes
  - Traces across services and proposes options with tradeoffs.
- Leads the change
  - Reduces P95 latency or infra cost measurably.

---

<!-- _class: split-panel proof cat-5 -->
<!-- _footer: "Level 5 · split-panel proof cat-5" -->

`Level 5 · Evaluating`

## Judge options against strategy and time.

*Which option should win?* You frame criteria, compare architectures, and make calls that hold up over a three-year horizon.

### You know you're here when

You choose a modular monolith over microservices — weighing scale, TCO, and compliance — and get buy-in from four teams.

- Frames criteria
  - Compares options and recommends with clear rationale.
- Gains adoption
  - Aligns multiple teams on the decision and its tradeoffs.

---

<!-- _class: split-panel proof capstone cat-6 -->
<!-- _footer: "Level 6 · split-panel proof capstone cat-6" -->

`Level 6 · Creating`

## Build what didn't exist before.

*What should exist?* You synthesize new frameworks, platforms, and operating models — the artifact you produce becomes the standard others build on.

### The signal

You design a cross-cloud, policy-aware data platform framework, and teams across the enterprise adopt it as their foundation.

- Reference architecture
  - The implementation exists and is validated.
- Organization-wide adoption
  - Measurable outcomes follow.

---

<!-- _class: compare-prose axis -->
<!-- _footer: "The second axis · compare-prose axis" -->

## The second axis: how far it reaches.

The verb is one axis — how you think. **Reach** is the other — how far what you make travels. Your level is where they meet: **Evaluate** for your team and **Evaluate** across the org are different levels with the same verb.

- 
  - I
  - Own the verb
  - You can do the cognitive work — correct, clear, complete. So far it reaches only you.
- 
  - II
  - Widen the reach
  - The work travels: team, org, field. Documented, adopted, durable — the farther it carries, the higher the level.

*Most engineers stall here — not on the thinking, but on making it travel past their own hands. That gap, not the verb, is what earns the title.*

---

<!-- _class: matrix-grid head-center -->
<!-- _footer: "The matrix · matrix-grid" -->

`Wider reach → · Deeper cognition ↑`

## Your level is a cell, not a rung.

Your title is the diagonal — the same verb at a wider reach is a different level.

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative and company-specific; still cumulative.

---

<!-- _class: list-steps capsule cat rule-none -->
<!-- _footer: "How to use this tomorrow · list-steps capsule cat" -->

## How to use this tomorrow.

1. Place yourself
   - Name the verb you own and how far it reaches today. Be honest — most of us straddle two.
2. Pick your next move
   - A deeper verb, or the same verb carried wider — concrete, time-bound, tied to real work.
3. Collect the evidence
   - Design docs, ADRs, before/after metrics, postmortems — artifacts that prove the shift happened.

---

<!-- _class: closing silent spectrum -->

## Grow on two axes, not one.

Deepen the verb — change the question you ask. Widen the reach — make the work travel past your own hands. Every level you've passed still lives in how you work; the title follows when both axes show up in the evidence.
