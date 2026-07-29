---
marp: true
theme: indaco
size: story
paginate: true
---

<!-- _class: title silent -->

# Adaptive by box, not by size.

`Lattice · component adaptive sizing — sweep`

Twelve more components, each rendered on a 9:16 frame. Every one reflows to the box it occupies — no size-specific variant was authored into the deck. Compare any slide against its landscape gallery: the structure changes, the type stays anchored.

---

<!-- _class: list takeaway -->

## What you're inspecting.

- Each layout below was authored once, with no portrait variant selected.
- The reflow fires purely from the container's aspect crossing a family boundary.
- Multi-column grids collapse; horizontal strips stack; side-by-side panels go vertical.
- The same decks render unchanged in landscape — the query is inert above 1.05 aspect.
- Judge each as a boardroom slide: is the portrait read as composed as the landscape one?

---

<!-- _class: logo-wall -->

`Trusted by`

## 400+ teams run board prep on Lattice.

- ![Acme](../lib/components/inventory/logo-wall/acme.svg)
- ![Globex](../lib/components/inventory/logo-wall/globex.svg)
- ![Initech](../lib/components/inventory/logo-wall/initech.svg)
- ![Umbra](../lib/components/inventory/logo-wall/umbra.svg)
- ![Vantage](../lib/components/inventory/logo-wall/vantage.svg)
- ![Meridian](../lib/components/inventory/logo-wall/meridian.svg)
- ![Helios](../lib/components/inventory/logo-wall/helios.svg)
- ![Lumen](../lib/components/inventory/logo-wall/lumen.svg)

---

<!-- _class: statute-stack -->

## Children's data — three jurisdictions, three obligations.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 data.
  - `In effect since 2000`
- State
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - Opt-in to sell or share under-16 data; opt-out over-16.
  - `Enforced 2023`
- Local
  - `NYC Admin Code §22-1201`
  - Bias-audit obligation for employment AEDTs.
  - `Effective 2023`

---

<!-- _class: decision -->

## Buy the platform; build the difference.

- Buy and configure.
  - Adopt the vendor's data infrastructure — live in six weeks, freeing three engineer-quarters for the product layer where the difference actually lives.
- Build in-house.
  - Full control of schema and roadmap, but two to three engineer-quarters to reach parity with a platform we could adopt now and replace later.
- Defer a year.
  - Cheapest this quarter, dearest by 2028 — the renewal locks us in and the discount has already leaked to two prospects.

---

<!-- _class: list-steps -->

## What happens in the first hour of an incident.

1. Declare and page
   - Whoever notices opens the channel and pages on-call. Declaring is cheap.
2. Assign a commander
   - One owner for coordination — directing the response, not debugging it.
3. Stop the bleeding
   - Mitigate before diagnosing; root-cause once customers are safe.
4. Communicate on a clock
   - A status update every 30 minutes — silence is what the retro remembers.

---

<!-- _class: compare-prose -->

## Renew at list price, or hold the discount.

- Hold the published rate
  - Protect the list price and signal pricing discipline to the rest of the base. Risks four at-risk accounts worth $2.1M ARR walking at renewal.
- Extend the legacy discount
  - Keep the four accounts by carrying their 2023 pricing one more year. Buys retention now, but the discount has already leaked to two prospects in the same segment.

---

<!-- _class: actors -->

## Who owns each part of the framework.

- Owns the scoring model `Head of Product`
  - Sets the weights and signs off changes after each calibration, then retunes them until the output agrees with the roadmap.
- Runs the weekly signal review `Chief of Staff`
  - Chairs the thirty minutes and keeps the decision log current.
- Maintains the decision log `Program Manager`
  - Every call recorded with its bet; chases the missing predicted outcomes.
- Owns adoption `Enablement Lead`
  - Onboards each team to the weekly ritual.

---

<!-- _class: list-tabular -->

## The five workstreams carrying the transformation.

1. Framework
   - The scoring model, the signal taxonomy, and the weights nobody quite agrees on.
   - _Two analysts · ships Q3_
2. Adoption
   - Onboarding every team to the weekly ritual and the decision log.
   - _One enablement lead · ships Q3_
3. Governance
   - The operating rhythm, the review cadence, and the escalation path.
   - _One chief of staff · ships Q4_
4. Tooling
   - The intake form, the dashboards, and the exports for the board.
   - _One PM · ships Q4_
5. Change
   - Comms, exec sponsorship, and the people who preferred the old way.
   - _One comms partner · ships Q4_

---

<!-- _class: q-and-a -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028. Switching now costs a single quarter of migration; switching after renewal costs three.
- What happens to the team mid-migration?
  - No headcount change. The same four engineers run both stacks through the eight-week overlap, then the legacy stack is decommissioned.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential, before any usage growth.

---

<!-- _class: q-and-a grid -->

## Four questions, one quadrant grid — collapsed to a column.

- Why now?
  - The renewal locks us in through 2028.
- Why this vendor?
  - The only one with a contracted export guarantee.
- What does it cost?
  - One quarter of migration, fully staffed.
- What's the risk?
  - Manageable — data export is contractual.

---

<!-- _class: regulatory-update -->

## Privacy and AI motion — Q1 2026.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - Conformity-assessment pre-market obligation took effect.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Developer and deployer duties for consequential-decision systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard for privacy branding.
   - `Final Mar 2026`

---

<!-- _class: citation-card -->

## What counts as "personal information" under CCPA.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows.

---

<!-- _class: citation-card split -->

## Split variant — two columns, collapsed to bands.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: device IDs and cookies are in scope, not just named people.
- **What we must do.**
  - Treat household-level identifiers as PI across notice, retention, and DSAR.

---

<!-- _class: citation-card triptych -->

## Triptych variant — three panels, collapsed to a stream.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that could reasonably be linked with a particular consumer or household.

- In plain English: device IDs and cookies count as personal information.
- **What we must do.**
  - Audit pixel and tag inventory; treat household identifiers as PI.

---

<!-- _class: glossary -->

## Glossary

- Consent
  - A freely given, specific, informed agreement to processing — pre-ticked boxes don't count.
- Controller
  - The party that decides why and how personal data is processed, and carries the legal accountability for it.
- DSAR
  - Data Subject Access Request — a person's demand to see, correct, or delete the data held on them, on a 45-day clock.
- PII
  - Personal information that identifies a person, read broadly enough to cover device IDs, cookies, and IP addresses.
- Processor
  - A party that processes data on the controller's instructions — a vendor, not the decision-maker.

---

<!-- _class: math -->

`Linear regression · OLS`

## The closed-form estimator.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible

---

<!-- _class: math compare -->

## Two estimators, side by side — collapsed to a column.

### Ordinary least squares
$$ \hat\beta = (X^\top X)^{-1} X^\top y $$
Unbiased, but unstable when $X^\top X$ is near-singular.

### Ridge
$$ \hat\beta = (X^\top X + \lambda I)^{-1} X^\top y $$
Trades a little bias for a large drop in variance.

---

<!-- _class: math matrix -->

## A matrix and its properties — stacked in portrait.

$$ M = \begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{pmatrix} $$

- **shape** — $2 \times 3$
- **rank** — $2$
- **rows** — observations
- **cols** — features

---

<!-- _class: title silent -->

## One contract, every frame.

`engineering/decisions/2026-06-18-component-adaptive-sizing.md`

Nothing on these slides selected a size. The components did.
