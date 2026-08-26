---
marp: true
size: story
theme: indaco
paginate: true
header: "Lattice · legal bucket reflow"
---

<!-- _class: title silent -->

# Legal layouts that read down the page.

`Feature · native to reflow · legal bucket · 2026-06-20`

The four legal multi-column layouts now collapse to a single column on a
square / tall / strip box — no portrait-specific variant authored into the
deck. Landscape renders byte-identically.

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

<!-- _class: authority-chain -->

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
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; small-business safe-harbor narrowed.
   - `Effective Mar 2026`

---

<!-- _class: citation-card -->

## What counts as "personal information" under CCPA.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.

---

<!-- _class: citation-card split -->

## CCPA defines "sale" broadly.

`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating a consumer's personal information to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands.

---

<!-- _class: citation-card triptych -->

## What "personal data" covers under GDPR.

`GDPR Art. 4(1) · definitions`

> 'Personal data' means any information relating to an identified or identifiable natural person.

- In plain English.
  - Any online identifier that can single out a person — IP address, cookie ID, device fingerprint.
- **What we must do.**
  - Scope notice and retention to cover online identifiers, not just named-person records.

---

<!-- _class: citation-card margin -->

## The GDPR lawful-basis test.

`GDPR Art. 6(1)(f) · legitimate interests`

> Processing is lawful only if and to the extent that processing is necessary for the purposes of the legitimate interests pursued by the controller, except where such interests are overridden by the interests or fundamental rights of the data subject.

- Two-part test.
  - Necessity first, then a balancing exercise against the data subject's rights. Document both halves or the basis fails on audit.

---

<!-- _class: closing silent -->

## Same markup, two orientations.

`Batch A1 · statute-stack · authority-chain · regulatory-update · citation-card`
