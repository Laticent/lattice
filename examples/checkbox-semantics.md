---
marp: true
theme: indaco
paginate: true
header: "Lattice · checkbox semantics"
footer: "Six answers, one meaning each"
---

<!-- _class: title silent -->

`Fix demo · state markers`

# Six answers, and each one means the same thing everywhere.

Yes, partly, no, unknown, open, and does not apply — in every layout that draws a mark.

---

<!-- _class: checklist -->

## The six marks, read the same way in every layout.

- [x] Yes — done, met, included
- [-] Partly — in progress, limited
- [!] No — failed, not met, missing
- [?] Unknown — looked at, cannot be settled
- [ ] Open — not started, not assessed
- [/] Does not apply — out of scope

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
- Rival `$59 / mo`
  - [x] Shared workspace
  - [x] Unlimited seats
  - [!] Audit log
  - [?] Single sign-on
  - What they leave out.

`[x]` Included · `[-]` Limited · `[!]` Missing · `[?]` Ask sales · `[ ]` Coming in Q3 · `[/]` Not on this plan

---

<!-- _class: table state-cells -->

## A comparison table can finally say "no".

| Criterion    | Chorus | Productboard | Notion | Sprig |
| ------------ | :----: | :----------: | :----: | :---: |
| Speed        | [x]    | [!]          | [x]    | [x]   |
| Auditability | [!]    | [x]          | [?]    | [x]   |
| Calibration  | [-]    | [-]          | [ ]    | [x]   |
| On-prem      | [/]    | [/]          | [!]    | [/]   |

`[!]` is a tested "no". `[?]` was tested and could not be settled. `[ ]` has not been tested yet.

---

<!-- _class: verdict-grid -->

## Verdict-grid: "no" and "not assessed" stop sharing a mark.

- Vendor North
  - [x] Speed
  - [!] Audit
  - [?] Adoption
  - [ ] Pricing
  - Fails the audit. Adoption data is disputed.
- Vendor South
  - [x] Speed
  - [x] Audit
  - [-] Adoption
  - [/] Pricing
  - Passes the audit. Adoption is partial.

---

<!-- _class: obligation-matrix -->

## Obligation-matrix names the same six in its own words.

| Regime | Breach notice | Data export | Local storage |
| ------ | :-----------: | :---------: | :-----------: |
| GDPR   | [x]           | [x]         | [-]           |
| CCPA   | [x]           | [!]         | [/]           |
| PIPL   | [x]           | [?]         | [x]           |
| LGPD   | [x]           | [ ]         | [/]           |

---

<!-- _class: roadmap -->

## Roadmap does too: missed and uncertain join the plan.

| Workstream | Foundation `Q2 2026` | Hardening `Q3 2026` | Scale `Q4 2026` |
| --- | --- | --- | --- |
| Billing | [x] Plan tiers | [-] Seat limits | [!] Usage metering |
| Compliance | [x] Breach notices | [?] Audit log | [/] On-prem vault |
| Platform | [x] SSO | [ ] Data residency | [ ] Regional failover |

---

<!-- _class: content -->

## A mark in a sentence draws the same shape.

- Pen test `[x]` passed on the second run
- Load test `[-]` reached 80% of target
- SOC 2 evidence `[!]` rejected by the auditor
- Vendor SLA `[?]` terms not disclosed
- Status page `[ ]` copy not written yet
- EU region `[/]` moved out of this launch

Write a mark in inline code and it draws the disc, wherever inline code can go.

---

<!-- _class: closing silent -->

`State markers · one vocabulary`

# Learn the six marks once.

Shape carries the answer. Solid discs are settled; the two hollow rings are not yet.
