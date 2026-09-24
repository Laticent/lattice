---
marp: true
theme: indaco
paginate: true
header: "Lattice · checkbox semantics"
footer: "One mark, one meaning"
---

<!-- _class: title silent -->

`Fix demo · state markers`

# An empty box means the same thing everywhere.

A tour of every component that draws the four marks, and the one that reads them differently on purpose.

---

<!-- _class: checklist -->

## The four marks, as every component now reads them.

- [x] Done — a green check
- [-] Partial — an amber dash
- [ ] Not yet — a gray open ring
- [/] Out of scope — a gray slash, label struck

---

<!-- _class: pricing -->

## The legend under the cards now matches the cards.

- Starter `$0`
  - [x] Shared workspace
  - [-] Five seats
  - [ ] Audit log
  - [/] Single sign-on
  - For evaluating.
- Growth `$49 / mo` *Most popular*
  - [x] Shared workspace
  - [x] Unlimited seats
  - [ ] Audit log
  - [/] Single sign-on
  - For scaling teams.
- Enterprise `Custom`
  - [x] Shared workspace
  - [x] Unlimited seats
  - [x] Audit log
  - [x] Single sign-on
  - For procurement.

`[x]` Included · `[-]` Limited · `[ ]` Coming in Q3 · `[/]` Not on this plan

---

<!-- _class: table state-cells -->

## The same plans as a table draw the same marks.

| Capability       | Starter | Growth | Enterprise |
| ---------------- | :-----: | :----: | :--------: |
| Shared workspace | [x]     | [x]    | [x]        |
| Seats            | [-]     | [x]    | [x]        |
| Audit log        | [ ]     | [ ]    | [x]        |
| Single sign-on   | [/]     | [/]    | [x]        |

`[x]` Included · `[-]` Limited · `[ ]` Coming in Q3 · `[/]` Not on this plan

---

<!-- _class: obligation-matrix -->

## Obligation-matrix reads the open ring as exempt.

| Regime | Breach notice | Data export | Local storage |
| ------ | :-----------: | :---------: | :-----------: |
| GDPR   | [x]           | [x]         | [-]           |
| CCPA   | [x]           | [x]         | [ ]           |
| PIPL   | [x]           | [-]         | [x]           |
| LGPD   | [x]           | [/]         | [ ]           |

---

<!-- _class: roadmap -->

## Roadmap reads the open ring as planned.

| Workstream | Foundation `Q2 2026` | Hardening `Q3 2026` | Scale `Q4 2026` |
| --- | --- | --- | --- |
| Billing | [x] Plan tiers | [-] Seat limits | [ ] Usage metering |
| Compliance | [x] Breach notices | [ ] Audit log | [/] On-prem vault |

---

<!-- _class: content -->

## A mark in a sentence draws the same shape.

- Audit log on Starter `[ ]` — coming in Q3
- Seats on Starter `[-]` — capped at five
- Single sign-on on Growth `[/]` — Enterprise only
- Shared workspace everywhere `[x]` — every plan

Write a mark in inline code and it draws the disc, wherever inline code can go.

---

<!-- _class: verdict-grid -->

## Verdict-grid is the one place an empty box means "not met".

- Vendor North
  - [x] Speed
  - [ ] Auditability
  - [x] Adoption
  - Fast and adopted, but fails the audit.
- Vendor South
  - [x] Speed
  - [x] Auditability
  - [-] Adoption
  - Passes the audit. Adoption is partial.

---

<!-- _class: closing silent -->

`State markers · one vocabulary`

# Learn the four marks once.

Only verdict-grid reads an empty box as a failure, because a verdict scores against a bar.
