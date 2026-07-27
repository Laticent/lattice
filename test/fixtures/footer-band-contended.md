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

It also carries **eleven dividers**, deliberately, so the rail reaches its `MAX_DOTS` cap of ten
and the `--footer-center-w` reserve is actually under load. A previous version had ONE divider,
so the rail drew one dot — and the suite that exists to prove the rail cannot crowd the footer
never put more than one mark on the rail. It passed while every portrait deck with eight or more
sections overprinted. Portrait matters here too: `--canvas-scale` makes the rail 28.95cqi in
portrait against 19.33cqi at `hd`, so portrait is where the reserve is tightest.

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

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 02 · Another named section`

## Section 2.

---

<!-- _class: content -->

## A railed body page in section 2.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 03 · Another named section`

## Section 3.

---

<!-- _class: content -->

## A railed body page in section 3.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 04 · Another named section`

## Section 4.

---

<!-- _class: content -->

## A railed body page in section 4.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 05 · Another named section`

## Section 5.

---

<!-- _class: content -->

## A railed body page in section 5.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 06 · Another named section`

## Section 6.

---

<!-- _class: content -->

## A railed body page in section 6.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 07 · Another named section`

## Section 7.

---

<!-- _class: content -->

## A railed body page in section 7.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 08 · Another named section`

## Section 8.

---

<!-- _class: content -->

## A railed body page in section 8.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 09 · Another named section`

## Section 9.

---

<!-- _class: content -->

## A railed body page in section 9.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 10 · Another named section`

## Section 10.

---

<!-- _class: content -->

## A railed body page in section 10.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 11 · Another named section`

## Section 11.

---

<!-- _class: content -->

## A railed body page in section 11.

One body page per section, so every dot in the rail is reachable and the band is measured on a
page that actually carries the full rail.

- A line
- Another line
---

<!-- _class: content -->
<!-- _footer: "Acme<sup>®</sup> Holdings — internal <img src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjYzAwIi8+PC9zdmc+' width='80' height='80'>" -->

## A footer carrying a TALL inline run.

`footer:` passes raw HTML through, and a board footer routinely carries a small mark. The
promoted footer is an in-flow item with auto height, so without a cap this grows the band from
21.6px to 103px — and the band is bottom-anchored, so it grows UPWARD into the stage and the
page number jumps between slides. The plain-text footer on every other page cannot catch it.

- A line
- Another line

---

<!-- _class: content silent -->

## `silent` must still hide the footer text.

The promote rule ties with the hide rules on specificity, so which one wins is decided by
bundle file order alone.

---

<!-- _class: content no-footer -->

## `no-footer` must still hide the footer text.

Same tie, the other modifier.
