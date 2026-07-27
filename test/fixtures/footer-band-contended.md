---
size: portrait
theme: indaco
paginate: true
form: standard
autosplit: on
header: "Lattice · footer band"
footer: "CONFIDENTIEL · Société Générale — ÜBERPRÜFUNG Q3 · do not distribute outside the Audit Committee · ÅÉÀÖ"
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 01 · The annexes`

## The section label is sized on purpose.

Long enough that the rail claims a real share of the band, short enough that the footer's
remaining share EXCEEDS its 52cqi budget — which is the only condition under which
`max-width: none` on the promoted footer does any work. At the label's first length the rail
sat on its own cap and the footer's share came out 13.7px UNDER 52cqi, so removing the
override changed nothing and the mutation survived.

---

<!-- _class: checklist -->

## A list long enough to split, so the band gets a fourth mark.

The promoted footer only exists on a SPLIT band (and on a split cover), because that is
where a fourth mark makes the row genuinely over-subscribed. So this fixture must actually
split — a fixture that renders one page exercises none of the shrink policy, which is how
the first version of this file let seven of nine mutations through.

The footer carries accented CAPITALS on purpose: `overflow: hidden` on a `line-height: 1`
box clips everything above cap height, so `ÜBERPRÜFUNG` printed as `UBERPRUFUNG` and no box
or ink measurement could see it.

- [x] Signal intake wired end to end, with the latency budget agreed
- [x] Scoring model recalibrated on eighteen months of settled outcomes
- [x] Decision log live, with a written owner and a date on every call
- [x] Calibration loop running weekly against the shipped scores
- [ ] Risk register populated and reviewed by the second line
- [ ] Budget tracker reconciled against the ledger for the quarter
- [ ] Hiring plan approved by the committee that owns the headcount
- [ ] Roadmap published with the dependencies named
- [ ] Retrospective template ready and agreed with the chairs
- [ ] Metrics review automated end to end
- [ ] Customer interviews booked through the end of the quarter
- [ ] Residency review closed with no open findings

---

<!-- _class: content silent -->

## `silent` must still hide the footer text.

The promote rule ties with the hide rules on specificity, so which one wins is decided by
bundle file order alone.

---

<!-- _class: content no-footer -->

## `no-footer` must still hide the footer text.

Same tie, the other modifier.
