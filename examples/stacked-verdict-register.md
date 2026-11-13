---
theme: indaco
paginate: true
header: "Lattice · stacked verdicts"
---

<!-- _class: title silent -->

# Stacked verdict cards follow the align register

`Fix · verdict-grid narrow form`

In a narrow pane the verdict grid goes to one column. Its cards now sit where `align:` puts them.

---

<!-- _footer: "default · the manifest asks for center" -->

## By default the stack sits as a centered band.

<!-- _class: columns ratio-35-65 -->
<!-- _pane: verdict-grid -->

- Path A · Spreadsheet
  - [x] Speed
  - [!] Audit
  - Open everywhere; no trace of who changed what.
- Path C · Build in house
  - [x] Speed
  - [x] Audit
  - Fits our controls. This is the pick.

<!-- _pane: content -->

A 35% pane is too narrow for two cards a row, so the grid stacks. Each card keeps its content height and the band sits in the middle of the pane. Before this fix every card stretched to fill the pane, whatever the register said.

---

<!-- _footer: "align-fill · each card takes an equal share" -->

## Fill shares the height among the cards.

<!-- _class: columns ratio-35-65 -->
<!-- _pane: verdict-grid align-fill -->

- Path A · Spreadsheet
  - [x] Speed
  - [!] Audit
  - Open everywhere; no trace of who changed what.
- Path C · Build in house
  - [x] Speed
  - [x] Audit
  - Fits our controls. This is the pick.

<!-- _pane: content -->

Under `align-fill` each card grows to an equal share of the pane, and its content sits centered inside it. This is the one register that fills, and before the fix a pane never applied it: the pane set two of the register's four values.

---

<!-- _footer: "align-top · the band starts at the top" -->

## Top puts the stack under the pane's top edge.

<!-- _class: columns ratio-35-65 -->
<!-- _pane: verdict-grid align-top -->

- Path A · Spreadsheet
  - [x] Speed
  - [!] Audit
  - Open everywhere; no trace of who changed what.
- Path C · Build in house
  - [x] Speed
  - [x] Audit
  - Fits our controls. This is the pick.

<!-- _pane: content -->

Under `align-top` the cards keep their content height and start at the top of the pane. The spare height collects below the last card.

---

<!-- _footer: "align-spread · even gaps around each card" -->

## Spread puts the spare between the cards.

<!-- _class: columns ratio-35-65 -->
<!-- _pane: verdict-grid align-spread -->

- Path A · Spreadsheet
  - [x] Speed
  - [!] Audit
  - Open everywhere; no trace of who changed what.
- Path C · Build in house
  - [x] Speed
  - [x] Audit
  - Fits our controls. This is the pick.

<!-- _pane: content -->

Under `align-spread` the spare height is shared out as even gaps around the cards, so the two options read as separate decisions rather than one block.

---

<!-- _footer: "a portrait page holds one option and it still fills" -->

## A lone option on its own page still fills it.

A portrait deck shows one verdict card per page. A member alone on its page claims the stage (the split run's lone-member rule), so a portrait export is unchanged by this fix: 0 of 965 slide images moved across every deck with panes and the verdict-grid and matrix-2x2 galleries, at hd, portrait and mobile.

> The register places a stack of two or more cards. One card is the page.
