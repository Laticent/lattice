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

A plain GFM pipe table used to render at raw browser defaults on every slide that was not one of the table-owning components. It now inherits a house treatment from the base layer — palette-blind, and standing off the six components that still style their own table.

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

<!-- _class: table-plain table-fill -->

`Two switches`

## Striping off, vertical fill on

`table-plain` clears the row wash; `table-fill` lets the table take the leftover stage height so its rows spread instead of stacking at the top. Both are custom properties underneath — `--table-zebra` and `--table-grow` — so a theme or a deck's `style:` block can set them without touching a slide.

| Workstream | Owner | Q3 | Q4 |
| --- | --- | --- | --- |
| Migration | Platform | Complete | — |
| Attestation | Legal | In flight | Complete |
| Key rotation | Security | Not started | In flight |

---

<!-- _class: table -->

`The first column`

## The row label is measured, not assumed

The first column reads as a label — 600 weight, heading ink — when it actually is
one. The engine decides per table from the header cell and the column itself.

| Criterion | Option A | Option B |
| --- | --- | --- |
| Speed | Fast | Slow |
| Cost | Low | High |

*Measured ON: a named header over a textual column.*

---

<!-- _class: table -->

`The first column`

## A year column is not a set of labels

The same slide class, a numeric first column, and the emphasis declines itself —
no author opt-out needed. It also declines on an index header (`#`, `No.`,
`Ref`), a column of bare state markers, and a single-column table.

| Year | Revenue | Growth |
| --- | --- | --- |
| 2024 | $4.2M | +21% |
| 2025 | $5.1M | +3% |

*Measured OFF: every cell in column one is a number.*

---

<!-- _class: row-label -->

`row-label`

## `row-label` forces it on — even here

A plain table, no component class, and the measurement would have declined this
column. `row-label` overrules it. `no-row-label` overrules the other way, and
wins if a slide somehow carries both.

| Year | Revenue | Growth |
| --- | --- | --- |
| 2024 | $4.2M | +21% |
| 2025 | $5.1M | +3% |

*The author always has the last word.*

---

<!-- _class: table -->

`Riding it`

## The `table` component IS this treatment

`table` styles no `<table>` element of its own — it rides the rules above and adds
what only a manifest can declare: a row capacity, autosplit, the portrait card
reshape, and the focus axes. That is why the switches reach it.

| Dimension | Owned engine | Marp |
| --- | --- | --- |
| Layout source | lattice.css | marp-core |
| Overflow | Fit Spine | none |
| Themes | 32 | 3 |

*Same rules as the un-classed slide above — plus a contract.*

---

<!-- _class: glossary -->

`Standing off`

## A specialist IS untouched — `glossary`

| Term | Meaning |
| --- | --- |
| Stage | The bounded content box a slide's body flows into |
| Deny guard | The `:where(:not(…))` list that holds base off a specialist |
| Subject | The last compound of a selector — what the rule actually styles |

---

<!-- _class: closing -->

`Gated, not remembered`

## The deny list cannot rot

An ownership gate fails the build three ways: on a component that styles a table with no deny entry, on a stale entry, and on an entry broader than the claim it names — which would silently withhold the default from every slide missing the variant.
