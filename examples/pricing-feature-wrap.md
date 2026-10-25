---
marp: true
theme: indaco
paginate: true
header: "Lattice · pricing feature rows wrap"
---

<!-- _class: title silent -->

# A pricing feature row wraps inside its card.

`pricing · fix · 2026-10-25`

A feature row used to stay on one line however narrow its tier was, so the card cut the end of any row longer than the column.

---

<!-- _class: pricing -->
<!-- _footer: "The default sample · \"Checks accumulate up the ladder\" ran 11px past the Growth card and was cut" -->

## Three tiers, one recommended column.

- Starter `$0`
  - [x] The checklist rows compare
  - [-] A dash marks a capped limit
  - [/] Slashed rows mean not included
  - One line positions the tier.
- Growth `$49 / mo` *Most popular*
  - [x] The starred tier gets the accent
  - [x] Checks accumulate up the ladder
  - [/] One gap keeps it honest
  - The column buyers should read first.
- Enterprise `Custom`
  - [x] The top tier checks every row
  - [x] Custom replaces a number
  - [x] Nothing slashed up here
  - The ceiling of the ladder.

---

<!-- _class: pricing -->
<!-- _footer: "Long rows · each wraps under its own text; the mark stays on the first line" -->

## Real feature names run longer than the sample.

- Team `$12 / seat`
  - [x] Unlimited decks with version history
  - [x] Shared themes across the workspace
  - [/] Single sign-on with your identity provider
  - For one team that presents weekly.
- Business `$29 / seat` *Recommended*
  - [x] Unlimited decks with version history
  - [x] Shared themes across the workspace
  - [x] Single sign-on with your identity provider
  - For a department with its own budget.
- Enterprise `Custom`
  - [x] Everything in Business, per workspace
  - [x] Audit log exported to your security tools
  - [x] A named success manager
  - For procurement and compliance.

---

<!-- _class: pricing four -->
<!-- _footer: "four · the narrowest columns, where wrapping matters most" -->

## Four tiers narrow the columns.

- Free `$0`
  - [x] One seat
  - [/] Shared themes across the workspace
  - [/] Single sign-on
  - For trying it out.
- Team `$12`
  - [x] Five seats
  - [x] Shared themes across the workspace
  - [/] Single sign-on
  - For one team.
- Business `$29` *Most popular*
  - [x] Fifty seats
  - [x] Shared themes across the workspace
  - [x] Single sign-on
  - For a department.
- Enterprise `Custom`
  - [x] Unlimited seats
  - [x] Shared themes across the workspace
  - [x] Single sign-on and user provisioning
  - For the whole company.

---

<!-- _class: pricing two -->
<!-- _footer: "two · short rows still sit on one line" -->

## Two plans, head to head.

- Self-serve `$49 / mo`
  - [x] Wider columns, more feature rows
  - [/] The gap that motivates upgrading
  - The simple path.
- Enterprise `Custom`
  - [x] Everything in self-serve
  - [x] The rows that close deals
  - The guided path.

---

<!-- _class: pricing dark -->
<!-- _footer: "dark · the wrapped row keeps its strike-through and its muted color" -->

## Dark mode wraps the same way.

- Team `$12 / seat`
  - [x] Unlimited decks with version history
  - [-] Shared themes, up to three per workspace
  - [/] Single sign-on with your identity provider
  - For one team that presents weekly.
- Business `$29 / seat` *Recommended*
  - [x] Unlimited decks with version history
  - [x] Shared themes across the workspace
  - [x] Single sign-on with your identity provider
  - For a department with its own budget.
- Enterprise `Custom`
  - [x] Everything in Business, per workspace
  - [x] Audit log exported to your security tools
  - [x] A named success manager
  - For procurement and compliance.

---

<!-- _class: pricing compact -->
<!-- _footer: "compact · tighter spacing, same wrap" -->

## Compact spacing keeps the wrap.

- Starter `$0`
  - [x] The checklist rows compare
  - [-] A dash marks a capped limit
  - [/] Slashed rows mean not included
  - One line positions the tier.
- Growth `$49 / mo` *Most popular*
  - [x] The starred tier gets the accent
  - [x] Checks accumulate up the ladder
  - [/] One gap keeps it honest
  - The column buyers should read first.
- Enterprise `Custom`
  - [x] The top tier checks every row
  - [x] Custom replaces a number
  - [x] Nothing slashed up here
  - The ceiling of the ladder.

---

<!-- _class: closing silent -->

## A feature row now wraps instead of being cut.

`pricing.styles.css · the feature-row badge`
