---
marp: true
theme: indaco
paginate: true
header: "Lattice · checkbox semantics"
footer: "One [ ], one meaning"
---

<!-- _class: title silent -->

`Fix demo · state markers`

# An empty box means the same thing everywhere.

Pricing and `state-cells` tables used to draw the empty box differently from the rest of the deck.

---

<!-- _class: checklist -->

## The universal reading: an open ring means "not yet".

- [x] Done draws a green check
- [-] Partial draws an amber dash
- [ ] Not started draws a gray open ring
- [/] Out of scope draws a slash, struck through

---

<!-- _class: pricing -->

## Pricing now draws the same open ring.

- Starter `$0`
  - [x] Shared workspace
  - [-] Five-seat limit
  - [ ] Audit log, shipping in Q3
  - [/] Single sign-on
  - The Q3 row drew a red cross before this fix.
- Growth `$49 / mo` *Most popular*
  - [x] Shared workspace
  - [x] Unlimited seats
  - [ ] Audit log, shipping in Q3
  - [/] Single sign-on
  - An open ring is coming. A slash is left out.
- Enterprise `Custom`
  - [x] Shared workspace
  - [x] Unlimited seats
  - [x] Audit log
  - [x] Single sign-on
  - Every row checked.

---

<!-- _class: table state-cells -->

## Tables with state-cells draw the ring in gray again.

| Capability  | Starter | Growth | Enterprise |
| ----------- | :-----: | :----: | :--------: |
| Workspace   | [x]     | [x]    | [x]        |
| Seats       | [-]     | [x]    | [x]        |
| Audit log   | [ ]     | [ ]    | [x]        |
| SSO         | [/]     | [/]    | [x]        |

The ring had kept `--text-label`, which is accent-colored. It now uses `--muted-mark`, like every other open ring.

---

<!-- _class: content -->

## Inline marks were already right, and now they match.

- Audit log on Starter `[ ]` — open ring, not started
- Seat limit on Starter `[-]` — amber dash, partial
- SSO on Growth `[/]` — slash, out of scope

A mark written in a sentence, a table cell and a pricing card now all draw the same shape.

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
