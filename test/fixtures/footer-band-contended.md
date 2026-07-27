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

`Section 01 · The annexes and their approved decoration, at length`

## The divider eyebrow is long on purpose.

Not because the rail prints it — it does not, and `footer-band.test.js` asserts that. Because
a long one is what the rail USED to print, and it is the string that made the band
unresolvable. Keeping it long here means that if anyone puts the label back, this fixture
reproduces the original defect rather than a mild version of it.

---

<!-- _class: checklist -->

## A list long enough to split, so the band gets a fourth mark.

This fixture must actually SPLIT, so the band carries all four marks — footer text, section
dots, the k-of-N split rail, page number — and the allocation policy is exercised rather than
merely present. A fixture that renders one page exercises none of it, which is how the first
version of this file let seven of nine mutations through.

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
