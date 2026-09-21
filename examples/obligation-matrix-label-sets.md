---
marp: true
theme: indaco
paginate: true
header: "Lattice · obligation-matrix label sets"
---

<!-- _class: title silent -->

# The key you used to retype.

`Label sets · obligation-matrix · a key the grid draws for itself`

This layout's key was a sentence the author wrote by hand on every slide —
bound to nothing, and easy to forget. Its own docs listed forgetting it as an
authoring mistake. The grid now draws the key from the markers in its cells.

---

<!-- _class: obligation-matrix -->
<!-- _footer: "Derived · nothing authored" -->

## The grid names its own markers.

| Regulation | Notice | Consent | Retention | Breach |
| ---------- | :----: | :-----: | :-------: | :----: |
| GDPR       | [x]    | [x]     | [x]       | [x]    |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    |

Nothing is authored here. The key under the grid is built from the cells.

---

<!-- _class: obligation-matrix -->
<!-- _footer: "Derived · only the markers present get a row" -->

## A key never names a marker the grid does not carry.

| Regulation | Notice | Consent | Retention |
| ---------- | :----: | :-----: | :-------: |
| GDPR       | [x]    | [x]     | [x]       |
| LGPD       | [x]    | [x]     | [x]       |

Every cell here applies, so the key has exactly one row. A row pointing at no
cell is one the reader cannot find.

---

<!-- _class: obligation-matrix -->
<!-- _footer: "Overridden · compliance words become licensing words" -->

`[{[x], In force}, {[ ], Not subject}]`

## The same grid, for a licensing review.

| Regime     | Register | Disclose | Audit | Renew |
| ---------- | :------: | :------: | :---: | :---: |
| Class A    | [x]      | [x]      | [x]   | [x]   |
| Class B    | [x]      | [-]      | [x]   | [ ]   |
| Class C    | [x]      | [ ]      | [ ]   | [ ]   |

Two markers renamed; the third keeps its default.

---

<!-- _class: obligation-matrix heat -->
<!-- _footer: "heat · the key follows the cells, whatever they paint" -->

`[{[x], Exposed}, {[ ], Carved out}]`

## The key cannot drift from the cells.

| Regulation | Notice | Consent | Retention | Breach |
| ---------- | :----: | :-----: | :-------: | :----: |
| GDPR       | [x]    | [x]     | [x]       | [x]    |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [ ]    |

Heat marks burden, not relief — exempt cells stay neutral. The key's swatches
take the cells' own classes, so one stylesheet rule paints both.

---

<!-- _class: list -->
<!-- _footer: "What the label set changed here" -->

## What changed.

- The key is drawn from the cells, not typed by the author
- Only the markers actually present get a row, in a canonical order
- The words are a default: rename any marker, the rest keep theirs
- A marker is addressed as `\[x]`, exactly as a cell spells it
- One stylesheet rule paints both the key and the grid it decodes
