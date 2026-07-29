---
marp: true
theme: indaco
paginate: true
header: "Lattice · universal-pill"
---

<!-- _class: title silent -->

# The universal pill

`Base · Finish · Structure`

One geometry for every status and metadata pill — consistent padding,
centre-aligned text, colour left to carry the meaning.

---

<!-- _class: verdict-grid -->
<!-- _footer: "verdict-grid · state-marker badges" -->

## Badges share the pill's geometry, not its colour.

- **Build in-house.**
  - [ ] Certified
  - [-] Residency
  - [ ] Export
  - Full control of every axis, and three engineer-quarters from having any of it.
- **Vendor North.**
  - [x] Certified
  - [x] Residency
  - [-] Export
  - Certified and in-region, but data export is support-gated, not self-serve.
- **Vendor West.**
  - [x] Certified
  - [x] Residency
  - [x] Export
  - Certified, in-region, and self-serve on every axis. Recommended.

---

<!-- _class: kpi compact -->
<!-- _footer: "kpi · uppercase is a per-pill opt-in" -->

## Same pill, with the uppercase opt-in.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan` `Board`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan`

---

<!-- _class: regulatory-update -->
<!-- _footer: "regulatory-update · accent-tinted status pills" -->

## Status pills, the same shape across layouts.

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

<!-- _class: timeline-list -->
<!-- _footer: "timeline-list · universal date pills + the sanctioned chart-status variant" -->

`Decision framework`

## Universal pills next to a sanctioned variant.

Date pills are the universal shape; green chips are the chart-status variant.

1. `2024 Q3` First workshop
   - Where we agreed to agree on "signal." Output: a fifth workshop.
2. `2025 Q1` Framework approved `decision`
   - The steering committee accepts the scoring model. Build approved; the build team is the steering committee.
3. `2025 Q3` Pilot live `live`
   - Four product teams onboarded; the decision log opens. Eighteen entries to date, against roughly three hundred decisions made.
4. `2026 Q1` Operating rhythm `live`
   - The weekly review lands on every team's calendar. Attendance, like the calibration step, remains aspirational.

---

<!-- _class: glossary -->
<!-- _footer: "glossary · auto-derived range pill in the heading" -->

## Glossary

- Consent
  - A freely given, specific, informed agreement to processing — pre-ticked boxes don't count.
- Controller
  - The party that decides why and how personal data is processed, and carries the legal accountability for it.
- DSAR
  - Data Subject Access Request — a person's demand to see, correct, or delete the data held on them, on a 45-day clock under CCPA.
- PII
  - Personal information that identifies a person, now read broadly enough to cover device IDs, cookies, and IP addresses.
- Processor
  - A party that processes data on the controller's instructions — a vendor, not the decision-maker.

---

<!-- _class: title silent -->

# Structure unifies, colour signals

`--pill-radius · --pill-pad-y · --pill-pad-x · --pill-weight`

Keep pill text to one (hyphenated is fine) or two words. Geometry comes
from the `--pill-*` tokens; `--pill-fg` / `--pill-bg` / `--pill-border`
carry the semantics.
