---
marp: true
theme: indaco
paginate: true
header: "Lattice · statute-stack"
---

<!-- _class: title silent -->

# statute-stack

`Inventory · Ledger · Structure`

Citation hierarchy — federal / state / local rows with citation, headline obligation, and status.

---

<!-- _class: statute-stack -->
<!-- _footer: "Default · statute-stack" -->

## Three jurisdictions, one obligation each.

- Federal `15 U.S.C. §6501`
  - Parental consent for under-13 data.
  - `In effect since 2000`
- State `Cal. Civ. §1798.120`
  - The right to opt out of sale.
  - `In effect since 2020`
- International `GDPR Art. 8`
  - Member-state consent age, 13 to 16.
  - `In effect since 2018`


---

<!-- _class: statute-stack hierarchy -->
<!-- _footer: "hierarchy · statute-stack hierarchy — Ordered by supremacy." -->

## hierarchy orders the stack by supremacy.

- Federal `15 U.S.C. §6501` `In effect since 2000`
  - Verifiable parental consent for under-13 personal data.
- State `Cal. Civ. §1798.120` `Enforced 2023`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
- Local `NYC §22-1201` `Effective 2023`
  - Bias-audit obligation for AEDTs used in employment decisions.


---

<!-- _class: statute-stack bands -->
<!-- _footer: "Horizontal bands · statute-stack bands — Full-width strips." -->

## bands strips each jurisdiction full-width.

- Federal `15 U.S.C. §6501` `In effect since 2000`
  - Verifiable parental consent for under-13 personal data.
- State `Cal. Civ. §1798.120` `Enforced 2023`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
- Local `NYC §22-1201` `Effective 2023`
  - Bias-audit obligation for AEDTs used in employment decisions.


---

<!-- _class: statute-stack preemption -->
<!-- _footer: "preemption · statute-stack preemption — Which law yields." -->

## preemption marks which law yields.

- Federal `15 U.S.C. §6501` `Preempts state rules`
  - Sets the floor for under-13 personal data collection.
- State `Cal. Civ. §1798.120` `Survives preemption`
  - Stricter opt-in regime on top of COPPA's baseline.
- Local `NYC §22-1201` `Independent of preemption`
  - Bias-audit obligation distinct from privacy preemption scope.


---

<!-- _class: statute-stack lane -->
<!-- _footer: "Markdown table · statute-stack lane — One column stack." -->

## lane runs the stack in one column.

| Jurisdiction | Citation              | Headline obligation       | Status      |
| ------------ | --------------------- | ------------------------- | ----------- |
| Federal      | 15 U.S.C. §6501       | Parental consent <13 data | In effect   |
| State        | Cal. Civ. Code §1798  | Notice + opt-out + DSAR   | Enforced    |
| Local        | NYC §22-1201          | Annual AEDT bias audit    | Effective   |


---

<!-- _class: statute-stack -->
<!-- stress-slide -->
<!-- _footer: "Stress test · statute-stack — Five jurisdictions — the ceiling." -->

## Five jurisdictions is the rail's hard ceiling.

- Federal `COPPA §6501`
  - The anchor tier reads first.
  - `2000`
- State `CCPA §1798`
  - Twenty-four words is each tier's line.
  - `2020`
- State `Tex. 541`
  - Parallel tiers must match shapes.
  - `2024`
- Intl `GDPR 8`
  - The fourth passed the soft mark.
  - `2018`
- Intl `PIPL 31`
  - The stop; six collapses the rail.
  - `2021`


---

<!-- _class: statute-stack dark -->
<!-- _footer: "Composition: dark · statute-stack dark" -->

## Three jurisdictions, one obligation each.

- Federal `15 U.S.C. §6501`
  - Parental consent for under-13 data.
  - `In effect since 2000`
- State `Cal. Civ. §1798.120`
  - The right to opt out of sale.
  - `In effect since 2020`
- International `GDPR Art. 8`
  - Member-state consent age, 13 to 16.
  - `In effect since 2018`


---

<!-- _class: statute-stack compact -->
<!-- _footer: "Composition: compact · statute-stack compact" -->

## Three jurisdictions, one obligation each.

- Federal `15 U.S.C. §6501`
  - Parental consent for under-13 data.
  - `In effect since 2000`
- State `Cal. Civ. §1798.120`
  - The right to opt out of sale.
  - `In effect since 2020`
- International `GDPR Art. 8`
  - Member-state consent age, 13 to 16.
  - `In effect since 2018`


---

<!-- _class: statute-stack accent -->
<!-- _footer: "Composition: accent · statute-stack accent" -->

## Three jurisdictions, one obligation each.

- Federal `15 U.S.C. §6501`
  - Parental consent for under-13 data.
  - `In effect since 2000`
- State `Cal. Civ. §1798.120`
  - The right to opt out of sale.
  - `In effect since 2020`
- International `GDPR Art. 8`
  - Member-state consent age, 13 to 16.
  - `In effect since 2018`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · statute-stack" -->

## When NOT to reach for statute-stack.

- **More than four rows.** The three-column rail collapses past four jurisdictions. For longer registers move to `lane` (table form) or split across two statute-stack slides by topic.
- **Citation without obligation.** Without the headline obligation sentence, the layout reads as a citation list. Use list-tabular spec when only the citation matters.
- **Mixed entry shapes.** Every row needs the same three parts — citation, obligation, status. A row missing the status pill or with prose instead of a citation breaks the visual contract.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `list-tabular` — the rows are citation-only references, no obligation prose
- `obligation-matrix` — obligations cross-tab against actors or controls
- `authority-chain` — the rows are a delegation lineage, not parallel jurisdictions
- `compare-table` — the comparison is across criteria, not jurisdictions
