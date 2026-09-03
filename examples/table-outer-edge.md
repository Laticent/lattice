---
marp: true
theme: indaco
paginate: true
header: "Lattice · Table outer edge"
meta: "Table outer edge · the last row draws no rule"
spectrum: duo
---

<!-- _class: title silent -->

`Tables · the outer bottom edge`

# The last row draws no rule

A table's row hairlines separate **rows**. Under the final row there is no next row to separate — only the slide's own chrome, which already draws a boundary. Every slide here carries a below-note, so you can see where the two used to collide.

---

<!-- _class: content -->

## Where the collision was

A `td` hairline between rows is a separator. The same hairline under the last row is the table's outer edge, and the stage puts its own rule right below it.

| Surface | Rule underneath | Was | Now |
| ------- | --------------- | --: | --: |
| obligation-matrix | below-note hairline | 25.0px | 133.7px |
| statute-stack lane | below-note hairline | 25.5px | 135.2px |
| compare-table | below-note hairline | 25.5px | 133.5px |
| plain table, filling the stage | below-note hairline | 25.5px | 133.5px |

Measured in Chromium at design size. Two rules that close with nothing between them read as one thick line.

---

<!-- _class: compare-table -->

## A comparison table ends on its last row.

| Criterion | Spreadsheet | Vendor North | In-house build |
| ------------ | ----------- | ------------ | -------------- |
| Speed | Already open | 3–4 weeks | Same quarter |
| Auditability | Weak | Strong | Strong |
| Calibration | None | Vendor-set | Ours to tune |
| Running cost | Lowest | Per seat | Staff time |

The table fills the stage, so its last row sits closest to this note — the case the change was made for.

---

<!-- _class: obligation-matrix -->

## Obligations cross-tab the same way.

| Regulation | Notice | Consent | Retention | Breach |
| ---------- | :----: | :-----: | :-------: | :----: |
| CCPA | [x] | [-] | [x] | [x] |
| GDPR | [x] | [x] | [x] | [x] |
| LGPD | [ ] | [x] | [-] | [x] |

State discs still decode from the `[x]` `[-]` `[ ]` markers; only the closing hairline is gone.

---

<!-- _class: statute-stack lane -->

## lane runs the stack in one column.

| Jurisdiction | Citation | Headline obligation | Status |
| ------------ | --------------------- | ------------------------- | --------- |
| Federal | 15 U.S.C. §6501 | Parental consent <13 data | In effect |
| State | Cal. Civ. Code §1798 | Notice + opt-out + DSAR | Enforced |
| Local | NYC §22-1201 | Annual AEDT bias audit | Effective |

Cited as of the last review; check the register before relying on any row.

---

<!-- _class: content -->

## A plain pipe table gets the same treatment.

| Region | Q3 revenue | Q4 revenue | Change |
| ------------- | ---------: | ---------: | -----: |
| North America | $4.2M | $5.1M | +21% |
| EMEA | $3.8M | $3.9M | +3% |
| APAC | $1.9M | $2.6M | +37% |

No class needed — the universal table treatment carries it. The zebra falls on odd rows, so it closes this three-row table; with an even count the last row simply ends in white, which is the intent.

---

<!-- _class: glossary -->

## Who was already there, and who is exempt.

| Component | Why it is not in the diff |
| ---- | ---------- |
| glossary | Already sets `border-bottom: none` on its cells — never had the collision. |
| math.derivation | Already clears its last row — the same fix, reached independently. |
| roadmap | Exempt: its cell border is grid structure, so clearing it opens the grid. |
| obligation-matrix `heat` | Exempt: the last row's border closes a 6px double bracket rail. |
| obligation-matrix `asymmetric` | Exempt: each cell is a card box, not a ruled row. |

The test is whether a cell's bottom border is a **separator** or **structure**. Only separators go.

---

<!-- _class: content -->

## Want the table bounded top and bottom?

Put the deck on `rule: none` in front matter, or one slide on `<!-- _class: rule-none -->`. The masthead hairline steps aside, the table's own spectrum bar becomes its top edge, and the table reads as one closed object.

That keeps the composition an author's choice rather than something the engine infers from the presence of a table.
