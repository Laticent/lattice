---
marp: true
theme: indaco
paginate: true
header: "Lattice · checks"
acronyms:
  PIPEDA: Pipeda
lexicon:
  CCPA/CPRA: C C P A and C P R A
---

<!-- _class: title silent -->

`Feature demo · checks`

# One check, any container

The six answers now have one owner. A component puts a check in a pill, a row or a cell, and never draws a chip of its own.

---

<!-- _class: verdict-grid -->

## Each criterion is a check inside a pill.

- Build in-house
  - [x] Residency
  - [-] Speed
  - [!] Audit trail
  - Full control, slow.
- Vendor North
  - [x] Residency
  - [x] Speed
  - [?] Audit trail
  - Audit still open.
- Vendor West
  - [x] Residency
  - [x] Speed
  - [/] Audit trail
  - No audit tier.

---

<!-- _class: pricing two -->

## A pricing feature is the check, then its words.

- Starter `$0`
  - [x] One shared workspace
  - [-] Audit log for thirty days
  - [/] Single sign-on with your identity provider
  - For one team, trying it out.
- Growth `$49 / mo`
  - [x] Every workspace your teams need
  - [x] Audit log for a full year
  - [?] Data residency outside the EU
  - For a company that is scaling.

---

<!-- _class: obligation-matrix pills -->

## With pills, every cell says its answer.

`[{[x], In force}, {[/], Not subject}]`

| Regulation | Notice | Consent | Retention | Breach |
| ---------- | :----: | :-----: | :-------: | :----: |
| GDPR       | [x]    | [x]     | [-]       | [x]    |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [?]    |
| PIPEDA     | [x]    | [x]     | [ ]       | [/]    |

The label set renames the pills, the key and the narration together.

---

<!-- _class: cards-grid -->

## The full form works anywhere inline code does.

- The shortcuts stay
  - Residency `[x]` · SSO `[-]` · SOC 2 `[?]`
- The full form names the answer
  - SOC 2 `@check{unknown}` · export `@check{fail}`
- Spoken words work too
  - SSO `@check{partly}` · rollout `@check{open}` · fax `@check{na}`
- With a label, one pill
  - `@check{yes, label=Residency}` `@check{no, label="Audit, EU"}`

---

<!-- _class: verdict-grid checks-outline -->

## Style variants reach the check inside the pill.

- Option one
  - [x] Residency
  - [-] Speed
  - [!] Audit
  - Fast, unaudited.
- Option two
  - [?] Cost
  - [ ] Calibration
  - [/] Adoption
  - Recommended.

---

<!-- _class: closing -->

# Six answers, one owner.

We recommend the shortcut for a quick answer and `\@check{…}` when a check needs a label. Either way, one plugin draws it.
