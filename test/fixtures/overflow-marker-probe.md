---
marp: true
theme: indaco
---

<!--
  The probe deck behind engineering/decisions/2026-07-30-overflow-marker-register.md.

  Two slides on purpose: one that FITS and one that does not. The fitting slide is
  as load-bearing as the clipping one — the register decides how an overflowing
  slide is marked, and a change that started marking slides that fit would be a
  worse defect than the one it fixed.

  Committed so the three-level claim stays reproducible rather than resting on a
  screenshot in a decision note. `export-marp` never renders, so this has to go
  through a REAL Marp render to say anything (HARD RULE #23):

    for L in reader author off; do
      node tools/export-marp.js test/fixtures/overflow-marker-probe.md \
        .scratch/ovf/$L --overflow-marker=$L
      ( cd .scratch/ovf/$L/overflow-marker-probe \
        && npm install \
        && npx marp overflow-marker-probe.md --html --allow-local-files \
             --theme-set lattice.css themes -o probe.pdf )
      bash tools/rasterize-for-review.sh \
        .scratch/ovf/$L/overflow-marker-probe/probe.pdf .scratch/ovf/png-$L
    done

  Expected on page 2, and nothing at all on page 1:
    reader  a calm "Content clipped" pill, bottom-center, NO ring
    author  a red inset ring, an "OVERFLOWS" corner flag, a "FIX ME" overlay
    off     nothing

  Add `color-mode: dark` to the front matter for the dark-mode pass — the pill is
  palette-blind (`--text-body` on `--bg`) and must invert, not disappear.
-->

# Overflow marker probe

A slide that fits.

---

<!-- _class: content -->

## A slide that does not fit.

- Item one with a reasonably long line of prose so the cell fills up quickly and honestly
- Item two with a reasonably long line of prose so the cell fills up quickly and honestly
- Item three with a reasonably long line of prose so the cell fills up quickly and honestly
- Item four with a reasonably long line of prose so the cell fills up quickly and honestly
- Item five with a reasonably long line of prose so the cell fills up quickly and honestly
- Item six with a reasonably long line of prose so the cell fills up quickly and honestly
- Item seven with a reasonably long line of prose so the cell fills up quickly and honestly
- Item eight with a reasonably long line of prose so the cell fills up quickly and honestly
- Item nine with a reasonably long line of prose so the cell fills up quickly and honestly
- Item ten with a reasonably long line of prose so the cell fills up quickly and honestly
- Item eleven with a reasonably long line of prose so the cell fills up quickly and honestly
- Item twelve with a reasonably long line of prose so the cell fills up quickly and honestly
- Item thirteen with a reasonably long line of prose so the cell fills up quickly and honestly
- Item fourteen with a reasonably long line of prose so the cell fills up quickly and honestly
