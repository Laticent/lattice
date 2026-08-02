---
marp: true
theme: indaco
paginate: true
header: "Lattice · Universal table"
meta: "Universal table · base layer"
---

<!-- _class: title silent -->

`Base layer · the default table`

# Universal table

A plain GFM pipe table used to render at raw browser defaults on every slide that was not one of the seven table-owning components. It now inherits a house treatment from the base layer — palette-blind, and standing off every component that styles its own table.

---

`No class at all`

## The gap this closes

Every table rule in the engine was scoped to a component. A markdown table on an un-classed slide, on `_class: content`, or under a base modifier got no borders, no cell padding, no header weight — the columns simply scattered across the slide.

| Region | Q3 revenue | Q4 revenue | Change |
| --- | --- | --- | --- |
| North America | $4.2M | $5.1M | +21% |
| EMEA | $3.8M | $3.9M | +3% |
| APAC | $1.9M | $2.6M | +37% |

*The slide above declares no `_class` — this is the base treatment alone.*

---

<!-- _class: content -->

`Inside a component`

## It reaches `content` too

The treatment is scoped to the stage's own child, so it lands wherever an author writes a table: an un-classed slide, a base-modifier slide, or a component that has no table opinion of its own.

| Control | Owner | Status |
| --- | --- | --- |
| Access review | Security | Complete |
| Vendor attestation | Legal | In flight |
| Key rotation | Platform | Not started |

---

`Alignment`

## Column alignment still comes from the source

Markdown's `:---`, `:---:` and `---:` alignment survives untouched — the treatment sets type, rules and padding, never the author's alignment.

| Metric | Target | Actual | Variance |
| :--- | :---: | ---: | ---: |
| Gross margin | 62% | 64.1% | +2.1pt |
| Net retention | 110% | 118% | +8pt |
| Payback | 18mo | 21mo | -3mo |

*Left, centered, right, right — as written in the pipe table.*

---

<!-- _class: compare-table -->

`Standing off`

## A specialist is untouched

A component that styles `<table>` owns its tables, and base stands off. Seven do: compare-table, glossary, obligation-matrix, statute-stack, math, roadmap and matrix-grid.

| Dimension | Owned engine | Marp |
| --- | --- | --- |
| Layout source | lattice.css | marp-core |
| Overflow | Fit Spine | none |
| Themes | 26 | 3 |

*Byte-identical to how this slide rendered before the change.*

---

<!-- _class: glossary -->

## Also untouched — `glossary`

| Term | Meaning |
| --- | --- |
| Stage | The bounded content box a slide's body flows into |
| Deny guard | The `:where(:not(…))` list that holds base off a specialist |
| Subject | The last compound of a selector — what the rule actually styles |

---

<!-- _class: closing -->

`Gated, not remembered`

## The deny list cannot rot

An ownership gate fails the build on a component that styles a table element without a deny entry, and on a stale entry naming a component that no longer styles one. The list stays honest without anyone having to remember it.
