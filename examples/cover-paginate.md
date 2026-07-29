---
size: portrait
theme: indaco
paginate: true
form: standard
header: "Lattice · Cover-paginate"
footer: "Cover-paginate"
---

<!-- _class: title -->

# Dense lists, split with a cover

`Fit Ladder · the cover-paginate move`

A long register can't shrink to fit — so when it overflows, the engine leads with a cover, then flows the layout's own cards on. Same deck, just more of it.

---

<!-- _class: content -->

## What cover-paginate adds

- A dense list overflows? It can't drop a type size — readability is the floor
- So the engine **leads with an accent cover** — a heading, a semantic intro, a forward arrow
- Then it flows the layout's **own native cards** on clean pages — never flattened to generic rows
- A small **progress rail** ties the run together — k-of-N, beside the page number (`autosplit: on`)

---

<!-- _class: statute-stack -->

## Children's-data obligations across seven jurisdictions.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 personal data.
  - `In effect since 2000`
- California
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
  - `Enforced 2023`
- New York City
  - `NYC Admin Code §22-1201`
  - Bias-audit obligation for AEDTs used in employment decisions.
  - `Effective 2023`
- Illinois
  - `740 ILCS 14 · BIPA`
  - Written release before collecting biometric identifiers.
  - `Private right of action`
- Texas
  - `Tex. Bus. & Com. §503.001 · CUBI`
  - Consent before capturing a biometric identifier for commerce.
  - `AG enforcement only`
- Virginia
  - `Va. Code §59.1-575 · VCDPA`
  - Opt-in consent for sensitive data, including children's.
  - `Effective 2023`
- Colorado
  - `Colo. Rev. Stat. §6-1-1301 · CPA`
  - Universal opt-out mechanism honored for targeted advertising.
  - `Effective 2023`

---

<!-- _class: regulatory-update -->

## Privacy and AI motion — the year in review.

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
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; small-business safe-harbor narrowed.
   - `Effective Mar 2026`
5. EU Data Act
   - `Reg 2023/2854`
   - Cloud-switching and IoT data-access duties begin to bite.
   - `Effective Sep 2026`
6. India DPDP Rules
   - `MeitY notification`
   - Consent-manager registration and children's-data rules finalized.
   - `Effective 2026`
7. UK DPDI
   - `Royal Assent`
   - Reforms UK GDPR; a recognized-legitimate-interest list is introduced.
   - `Effective 2026`

---

<!-- _class: authority-chain -->

## COPPA — the chain from statute to consent order.

1. Statute
   - `15 U.S.C. §6501`
   - Congress, 1998 — verifiable parental consent for under-13 data.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule; the 2013 rewrite expanded covered identifiers.
3. Guidance
   - `FTC Six-Step Compliance Plan`
   - Staff guidance — non-binding, but cited in every consent order.
4. Case
   - `In re Epic Games · 2022`
   - $245M consent order — operationalised the "actual knowledge" standard.
5. Case
   - `In re YouTube · 2019`
   - $170M penalty — channel-level COPPA liability for platforms.

---

<!-- _class: q-and-a -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028. Switching now costs a single quarter of migration; switching after renewal costs three.
- What happens to the team mid-migration?
  - No headcount change. The same four engineers run both stacks through the eight-week overlap, then the legacy stack is decommissioned.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential, before any usage growth.
- What is the rollback plan if the cutover fails?
  - The legacy stack stays warm for the full overlap; a failed cutover reverts in under an hour with no data loss.

---

<!-- _class: glossary -->

## Glossary

- Consent
  - A freely given, specific, informed agreement to processing — pre-ticked boxes don't count.
- Controller
  - The party that decides why and how personal data is processed, and carries the legal accountability for it.
- DSAR
  - Data Subject Access Request — a person's demand to see, correct, or delete the data held on them, on a 45-day clock.
- Legitimate interest
  - A lawful basis that balances the controller's purpose against the data subject's rights, no consent required.
- PII
  - Personal information that identifies a person, now read broadly enough to cover device IDs, cookies, and IP addresses.
- Processor
  - A party that processes data on the controller's instructions — a vendor, not the decision-maker.
- Pseudonymisation
  - Replacing identifiers with tokens so data can't be tied to a person without separately held keys.
- Special category
  - Sensitive data — health, biometrics, beliefs — carrying heightened processing conditions.

---

<!-- _class: closing -->

# A cover, then the cards — never a clipped register

`One cover finish across the dense-list family — nothing shrinks`
