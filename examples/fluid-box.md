---
marp: true
theme: indaco
paginate: true
header: "Lattice · fluid-box viewer"
---

<!-- _class: title silent -->

`Viewer · Responsive reading`

# Read it on your phone.

`A fixed 16:9 deck, opened on a phone — reflowed to portrait, one slide per screen. Same deck, no re-authoring.`

---

<!-- _class: list -->
<!-- _footer: "What fluid-box does" -->

## The deck stays fixed. The reading goes fluid.

- A deck is authored once at a fixed shape
  - The PDF and the canonical export are untouched — fluid-box never changes an exported byte.
- The viewer unbolts the box from that shape
  - Each slide sizes to the viewport instead of the authored 16:9, so a phone makes it portrait.
- The existing runtime does the rest
  - It re-derives orientation from the measured box and every component reflows to its tall layout for free.

---

<!-- _class: stats -->
<!-- _footer: "stats · reflows 4-across → stacked" -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`In landscape these sit in a row; on a phone they stack into a single column.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time

---

<!-- _class: kpi -->
<!-- _footer: "kpi · value + nested detail, reflows box-locally" -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan`
4. +18%
   - YoY revenue growth
   - vs 14% prior year `Ahead`

---

<!-- _class: list -->
<!-- _footer: "How to use it" -->

## One flag, one toggle.

- Export a fluid viewer
  - `lattice-emulator deck.md out.pdf --fluid` writes `out.html` as the viewer; the PDF is unchanged.
- It is opt-in, off by default
  - The viewer opens fluid on a phone and as the authored deck on a laptop; a pill toggles between them.
- Reflow is wired; density is next
  - A slide that overpacks a phone screen can still overflow — autofit and re-pagination are the sequenced follow-ups.

---

<!-- _class: closing silent -->

## Same deck. A reading that fits the screen.

`Related`

- `--fluid` — emit the opt-in viewer from any deck
- `kpi` / `stats` — figure rows that reflow box-locally
- The design — `engineering/decisions/2026-06-21-fluid-box-viewer-design.md`
