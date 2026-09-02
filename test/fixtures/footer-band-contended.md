---
size: portrait
theme: indaco
paginate: true
form: standard
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

<!-- _class: quote -->

## The band is contended on an AUTHORED slide, and it has three marks.

> Footer text, section dots, page number. The k-of-N split rail is not a fourth mark here and
> cannot be: a split page carries no deck header, footer or section rail at all (2026-09-01), so
> the band this suite measures only ever exists on a slide the splitter did not touch.

This fixture used to say the opposite — "must actually SPLIT, so the band gets a fourth mark" —
and every slide in it was a list. When splitting went structural, all of them split, every one
lost its band, and the suite measured ZERO bands rather than a contended one. That is why the
slides here are prose and atomic layouts now: they cannot split, so they keep their band. A
fixture that renders no band exercises nothing, which is the same failure as the first version
of this file, which let seven of nine mutations through.

It also carries **eleven dividers**, deliberately, so the rail reaches its `MAX_DOTS` cap of ten
and the `--footer-center-w` reserve is actually under load. A previous version had ONE divider,
so the rail drew one dot — and the suite that exists to prove the rail cannot crowd the footer
never put more than one mark on the rail. It passed while every portrait deck with eight or more
sections overprinted. Portrait matters here too: `--canvas-scale` makes the rail 28.95cqi in
portrait against 19.33cqi at `hd`, so portrait is where the reserve is tightest.

The footer carries accented CAPITALS on purpose: `overflow: hidden` on a `line-height: 1`
box clips everything above cap height, so `ÜBERPRÜFUNG` printed as `UBERPRUFUNG` and no box
or ink measurement could see it.


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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

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
page that actually carries the full rail. Prose, not a list, deliberately: a list would split,
and a split page carries no band for this suite to measure.

---

<!-- _class: content -->
<!-- _footer: "Acme<sup>®</sup> Holdings — internal <img src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjYzAwIi8+PC9zdmc+' width='80' height='80'>" -->

## A footer carrying a TALL inline run.

`footer:` passes raw HTML through, and a board footer routinely carries a small mark. The
promoted footer is an in-flow item with auto height, so without a cap this grows the band from
21.6px to 103px — and the band is bottom-anchored, so it grows UPWARD into the stage and the
page number jumps between slides. The plain-text footer on every other page cannot catch it.

Prose here for the same reason as the railed pages above: a list would split this slide, and a
split page carries no band — so the one slide that exists to test a tall footer would stop
having a footer to test.

---

<!-- _class: content silent -->

## `silent` must still hide the footer text.

The promote rule ties with the hide rules on specificity, so which one wins is decided by
bundle file order alone.

---

<!-- _class: content no-footer -->

## `no-footer` must still hide the footer text.

Same tie, the other modifier.
