---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · Legal & regulatory layouts"
footer: "Six anchors · five variants each · candidate deck"
---

<!-- galleryAuthored: legal-family domain composition; tools/build-bucket-galleries.js will not overwrite -->

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Legal layouts.

`Boardroom-ready · privacy, regulatory, compliance · 2026`

Six anchors. Five variants per anchor. Pick the strongest of each row.

---

<!-- _class: divider light -->
<!-- _footer: "Orientation · divider light" -->

`How to read this deck`

## Each anchor opens with a section divider, then walks five visual treatments of the same idea.

Mark the one that earns the room. Slot labels lift via the slotLabelLift transform — author writes `- Federal`, not `- **Federal**`. The obligation matrix uses the universal `[x] [-] [ ]` state grammar shared with verdict-grid and checklist.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 01 · statute-stack" -->

`Anchor 01 · Federal / State / Local`

## How does authority layer here?

---

<!-- _class: statute-stack -->
<!-- _footer: "Variant 1A · statute-stack (rails, default)" -->

## Children's data — three jurisdictions, three obligations.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 personal data.
  - Operators must post a clear notice and a deletion route.
  - `In effect since 2000`
- State
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
  - DSAR handling within 45 days; deletion verified.
  - `Enforced 2023`
- Local
  - `NYC Admin Code §22-1201`
  - Bias-audit obligation for AEDTs used in employment decisions.
  - Annual audit + candidate notice + public summary.
  - `Effective 2023`

Pick this when the room wants three parallel facts at a glance.

---

<!-- _class: statute-stack hierarchy -->
<!-- _footer: "Variant 1B · statute-stack hierarchy" -->

## Children's data — Federal floor, State stricter, Local narrowest.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 personal data; nationwide floor.
- State
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - Opt-in for selling under-16 data; California raises the floor for its residents.
- Local
  - `NYC Admin Code §22-1201`
  - Annual bias-audit obligation for employment AEDTs; narrowest scope.

Pick this when the room needs to see scope shrinking as the tier descends.

---

<!-- _class: statute-stack bands -->
<!-- _footer: "Variant 1C · statute-stack bands" -->

## Three jurisdictions, full prose, one row each.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 PI; deletion within reasonable period.
  - `In effect since 2000`
- State
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - Opt-in for selling or sharing under-16 data; 45-day DSAR response.
  - `Enforced 2023`
- Local
  - `NYC Admin Code §22-1201`
  - Annual bias-audit obligation for employment AEDTs; candidate notice required.
  - `Effective 2023`

Pick this when each row has more than a sentence to carry.

---

<!-- _class: statute-stack preemption -->
<!-- _footer: "Variant 1D · statute-stack preemption" -->

## Federal floor → State adds opt-in → Local adds audit duty.

- Federal
  - `15 U.S.C. §6501 · COPPA`
  - Verifiable parental consent for under-13 PI; this is the floor.
- State
  - `Cal. Civ. Code §1798.120 · CCPA/CPRA`
  - California adds opt-in for sale or sharing of under-16 data.
- Local
  - `NYC §22-1201`
  - New York City adds an annual AEDT bias-audit duty on top.

Pick this when the relationship between tiers is the point — not parallel facts.

---

<!-- _class: statute-stack lane -->
<!-- _footer: "Variant 1E · statute-stack lane" -->

## Children's data — jurisdiction, citation, obligation, status.

| Jurisdiction | Citation                | Headline obligation                        | Status         |
| ------------ | ----------------------- | ------------------------------------------ | -------------- |
| Federal      | 15 U.S.C. §6501         | Parental consent for under-13 data         | In effect 2000 |
| State        | Cal. Civ. Code §1798.120 | Opt-in for selling under-16 data          | Enforced 2023  |
| Local        | NYC §22-1201            | Annual bias audit for employment AEDTs     | Effective 2023 |

Pick this when the audience wants to scan many obligations at once.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 02 · citation-card" -->

`Anchor 02 · quote → translate → act`

## The verbatim regulation, in plain English, with the obligation.

---

<!-- _class: citation-card -->
<!-- _footer: "Variant 2A · citation-card (stack, default)" -->

## What counts as "personal information" under CCPA.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- What we must do
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.

---

<!-- _class: citation-card split -->
<!-- _footer: "Variant 2B · citation-card split" -->

## What counts as "personal information" under CCPA.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person.
- What we must do
  - Treat household-level identifiers as PI in notice, retention, and DSAR workflows.

---

<!-- _class: citation-card pull-quote -->
<!-- _footer: "Variant 2C · citation-card pull-quote" -->

## "Personal information" includes the household, not just the person.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- What we must do
  - Audit pixel inventory; treat household IDs as PI in DSAR workflows.

---

<!-- _class: citation-card margin -->
<!-- _footer: "Variant 2D · citation-card margin" -->

## Personal information, defined.

`Cal. Civ. Code §1798.140(o)`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked with a particular consumer or household.

- Household IDs count.
- Device fingerprints count.
- Action
  - Audit pixels next quarter.

---

<!-- _class: citation-card triptych -->
<!-- _footer: "Variant 2E · citation-card triptych" -->

## Personal information — three columns, three jobs.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> Information that identifies, relates to, describes, or could reasonably be linked with a particular consumer or household.

- Plain English: household-level data is in scope, not just data tied to a named person. Device IDs, cookies, IP addresses all qualify.
- Action
  - Audit pixel inventory and update DSAR workflow to handle household-level identifiers within 45 days.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 03 · obligation-matrix" -->

`Anchor 03 · regimes × obligations`

## Where every privacy regulator stands on every duty.

---

<!-- _class: obligation-matrix -->
<!-- _footer: "Variant 3A · obligation-matrix (grid, default)" -->

## Privacy obligations across regimes — state grid.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Filled · half · empty circles. Neutral ink — applies / partial / exempt as data.

---

<!-- _class: obligation-matrix heat -->
<!-- _footer: "Variant 3B · obligation-matrix heat" -->

## Privacy obligations across regimes — heat map.

| Regulation | Notice | Consent | Retention | Breach | DSAR |
| ---------- | :----: | :-----: | :-------: | :----: | :--: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]  |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]  |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]  |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]  |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]  |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]  |

Same grammar, semantic palette — red = applies, amber = partial, green = exempt.

---

<!-- _class: obligation-matrix pills -->
<!-- _footer: "Variant 3C · obligation-matrix pills" -->

## Privacy obligations across regimes — same grammar, no heat.

| Regulation | Notice | Consent | Retention | Breach | DSAR |
| ---------- | :----: | :-----: | :-------: | :----: | :--: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]  |
| CCPA       | [x]    | [-]     | [x]       | [x]    | [x]  |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]  |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]  |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]  |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]  |

Pills (no heat) — same data, neutral chrome. Less assertive than heat.

---

<!-- _class: obligation-matrix lanes -->
<!-- _footer: "Variant 3D · obligation-matrix lanes" -->

## Privacy obligations — categorical row stripes.

| Regulation | Notice | Consent | Retention | Breach | DSAR |
| ---------- | :----: | :-----: | :-------: | :----: | :--: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]  |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]  |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]  |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]  |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]  |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]  |

Lane stripes signal "this row is its own regime."

---

<!-- _class: obligation-matrix asymmetric -->
<!-- _footer: "Variant 3E · obligation-matrix asymmetric" -->

## Three regimes, three obligations, room to breathe.

| Regulation | Notice                                                   | Consent                                                        | DSAR                                                       |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| GDPR       | Pre-collection; layered with purposes and legal basis    | Opt-in; explicit for special-category data                     | 30-day response; identity verification required            |
| CCPA/CPRA  | At or before collection; "Notice at Collection" required | Opt-out default for sale/sharing; opt-in for under-16 minors   | 45-day response; two free requests per consumer per year   |
| LGPD       | Pre-collection; controller identity disclosed            | Opt-in for most processing; multiple legal bases recognised    | 15-day response; appeal route to the ANPD                  |

Pick when each cell carries a sentence, not a glyph.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 04 · regulatory-update" -->

`Anchor 04 · what's new`

## The regulatory motion that closed this quarter.

---

<!-- _class: regulatory-update -->
<!-- _footer: "Variant 4A · regulatory-update (changelog, default)" -->

## Privacy & AI motion — Q1 2026.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - Conformity-assessment pre-market obligation took effect.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Developer + deployer duties for consequential-decision systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard for privacy branding.
   - `Final Mar 2026`
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; small-business safe-harbor narrowed.
   - `Effective Mar 2026`

---

<!-- _class: regulatory-update cards -->
<!-- _footer: "Variant 4B · regulatory-update cards" -->

## Privacy & AI motion — Q1 2026.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - High-risk system conformity-assessment pre-market obligation took effect.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Developer + deployer duties for consequential-decision systems.
   - `Effective Feb 2026`
3. FTC Order
   - `In re Avast`
   - $16.5M consent order; browser-history sale despite privacy branding.
   - `Final Mar 2026`
4. Texas DPSA
   - `Bus. & Com. Code §541.151`
   - DSAR opt-out portal mandatory; safe-harbor narrowed.
   - `Effective Mar 2026`

---

<!-- _class: regulatory-update timeline -->
<!-- _footer: "Variant 4C · regulatory-update timeline" -->

## Privacy & AI motion — Q1 2026 timeline.

`January → February → March 2026`

1. PIPEDA Reform
   - `C-27`
   - Senate reading in January; commissioner powers expanded.
2. EU AI Act
   - `Title III`
   - High-risk conformity-assessment obligation took effect 2 Feb.
3. Colorado AI Act
   - `SB 24-205`
   - Developer + deployer duties effective 1 Feb.
4. FTC v. Avast
   - `§5`
   - Consent order final 14 Mar; $16.5M plus 20-year compliance program.

---

<!-- _class: regulatory-update diff-bands -->
<!-- _footer: "Variant 4D · regulatory-update diff-bands" -->

## Privacy & AI motion — Q1 2026 by kind of change.

`Added · Amended · Repealed · Enforced`

### Added

1. EU AI Act
   - `Title III · high-risk systems`
   - First conformity-assessment obligation took effect across the bloc.
2. Colorado AI Act
   - `SB 24-205`
   - New developer + deployer duties for consequential-decision systems.

### Amended

1. Texas DPSA
   - `§541.151`
   - Opt-out portal mandatory; small-business safe-harbor threshold narrowed.

### Enforced

1. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order finalised; 20-year compliance program.

---

<!-- _class: regulatory-update priority -->
<!-- _footer: "Variant 4E · regulatory-update priority" -->

## Privacy & AI motion — Q1 2026 priorities.

`What to act on, what to track, what to log`

1. Act this quarter — EU AI Act
   - `Title III`
   - High-risk conformity-assessment paperwork pre-market; engineering deadline before any EU launch.
2. Track — Colorado AI Act
   - `SB 24-205`
   - Developer + deployer duties; published deployer-notice template due in Q2.
3. Log — FTC v. Avast
   - `§5`
   - Consent order final; informs how the FTC frames the deception standard.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 05 · redline" -->

`Anchor 05 · textual diff`

## What changed in the text we live by?

---

<!-- _class: redline -->
<!-- _footer: "Variant 5A · redline (inline, default)" -->

## SB-362 rewrote the opt-out link rule.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins> designated method for submitting requests to opt-out, <ins>including, at minimum, a clear and conspicuous link on the homepage titled "Your Privacy Choices,"</ins> for use by consumers to <del>opt out of the sale of</del> <ins>direct the business not to sell or share</ins> their personal information.

- **Why this matters** SB-362 collapses "sale" and "sharing" into one duty and pins a uniform link title — homepage chrome and DSAR workflows both need a uniform UX.

---

<!-- _class: redline split -->
<!-- _footer: "Variant 5B · redline split" -->

## SB-362 rewrote the opt-out link rule — side-by-side.

`Cal. Civ. Code §1798.135 · before vs after`

> A business that **collects** consumers' personal information shall provide **two or more** designated methods for submitting requests to opt-out for use by consumers to **opt out of the sale of** their personal information.

> A business that **collects, sells, or shares** consumers' personal information shall provide **at least one** designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled **"Your Privacy Choices,"** for use by consumers to **direct the business not to sell or share** their personal information.

- **Why this matters** Sale and sharing collapse into one duty; the homepage chrome and DSAR workflows both need a uniform UX.

---

<!-- _class: redline annotated -->
<!-- _footer: "Variant 5C · redline annotated" -->

## SB-362 — annotated.

`Cal. Civ. Code §1798.135 · amendment SB-362`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins><sup>1</sup> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins><sup>2</sup> designated method for submitting requests to opt-out, <ins>including a homepage link titled "Your Privacy Choices,"</ins><sup>3</sup> for use by consumers to opt out.

1. **Scope** Sale and sharing now both trigger the opt-out duty — even free programs are in.
2. **Floor** Two-channel minimum drops to one; a homepage link plus a portal is now sufficient.
3. **Chrome** The literal link title is now mandated — uniform branding across the web.

---

<!-- _class: redline stacked -->
<!-- _footer: "Variant 5D · redline stacked" -->

## SB-362 — old block on top, new block below.

`Cal. Civ. Code §1798.135 · amendment SB-362`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out for use by consumers to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices," for use by consumers to direct the business not to sell or share their personal information.

---

<!-- _class: redline three-col -->
<!-- _footer: "Variant 5E · redline three-col" -->

## SB-362 — old, new, and why it changed.

`Cal. Civ. Code §1798.135 · amendment SB-362`

> A business that collects consumers' personal information shall provide two or more designated methods for opt-out — to opt out of the sale of personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one method, including a homepage link titled "Your Privacy Choices," to direct the business not to sell or share personal information.

- **Scope** Sale and sharing collapse into one duty — even free programs trigger the obligation.
- **Floor** Two-channel minimum drops to one — a homepage link plus a portal now suffices.
- **Chrome** The literal link title is now mandated — uniform branding.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Anchor 06 · authority-chain" -->

`Anchor 06 · statute → regulation → guidance → case`

## What actually binds us — and how far down the chain we are.

---

<!-- _class: authority-chain -->
<!-- _footer: "Variant 6A · authority-chain (chain, default)" -->

## COPPA — the chain, tier by tier.

1. Statute
   - `15 U.S.C. §6501`
   - Congress, 1998 — verifiable parental consent for under-13 data.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule; 2013 rewrite expanded covered identifiers.
3. Guidance
   - `FTC Six-Step Compliance Plan`
   - Staff guidance — non-binding, but cited in every consent order.
4. Case
   - `In re Epic Games · 2022`
   - $245M consent order — operationalised "actual knowledge" standard.

---

<!-- _class: authority-chain pyramid -->
<!-- _footer: "Variant 6B · authority-chain pyramid" -->

## COPPA — authority weight, top binds, bottom illustrates.

1. Statute
   - `15 U.S.C. §6501`
   - Congress, 1998. Binds nationwide.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule, 2013 rewrite.
3. Guidance
   - `FTC Six-Step Plan`
   - Non-binding but cited.
4. Case
   - `In re Epic Games`
   - $245M consent order, 2022.

---

<!-- _class: authority-chain branching -->
<!-- _footer: "Variant 6C · authority-chain branching" -->

## COPPA — one statute, many branches.

1. Statute
   - `15 U.S.C. §6501` COPPA, 1998
   - `16 C.F.R. Part 312` — FTC implementing rule
   - `FTC Six-Step Compliance Plan` — staff guidance
   - `In re Epic Games (2022)` — $245M consent order
   - `In re YouTube/Google (2019)` — $170M consent order

---

<!-- _class: authority-chain bracket -->
<!-- _footer: "Variant 6D · authority-chain bracket" -->

## COPPA — bracketed tiers.

1. Statute
   - `15 U.S.C. §6501`
   - Congress, 1998. The binding floor for under-13 data.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule; 2013 rewrite.
3. Guidance
   - `FTC Six-Step Plan`
   - Staff guidance — quoted in every order.
4. Case
   - `In re Epic Games`
   - $245M consent order, 2022 — defines "actual knowledge."

---

<!-- _class: authority-chain trail -->
<!-- _footer: "Variant 6E · authority-chain trail" -->

## COPPA — four steps to the operative test.

1. Statute
   - `15 U.S.C. §6501`
2. Regulation
   - `16 C.F.R. Part 312`
3. Guidance
   - `FTC Six-Step Plan`
4. Case
   - `In re Epic Games · 2022`

---

<!-- _class: list takeaway numbered -->
<!-- _footer: "Closing · list takeaway numbered" -->

## What this deck delivers.

- Six anchor layouts cover jurisdiction, quotation, regime matrix, motion, redline, and authority.
- Five visual variants per anchor — the strongest of each becomes the shipped default.
- Lean authoring: slot labels auto-lift, `[x] [-] [ ]` for state markers, pin-cite typography throughout.
- Shared-kernel parity: the owned engine (CLI/PDF path + browser playground) and the runtime process the same transforms.
- The other four variants per anchor can be deleted before graduation into the gallery.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: '' -->

## Mark the winners. The rest goes to the cutting room floor.

`Lattice · Legal & regulatory · candidate deck`
