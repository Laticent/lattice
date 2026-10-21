---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · universal token system"
footer: "Phase 4 — surfaces / scheme"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _footer: '' -->

# One surface, one honest name.

`Universal token system · Phase 4`

*This very title rides `--surface-inverse` — the dark panel that used to be confusingly spelled `--bg-dark`.*

---

<!-- _class: cards-grid -->

## The --bg-dark vs --dark-bg fix.

- The collision
  - `--bg-dark` (a dark panel on a light deck) sat one keystroke from `--dark-bg` (the canvas in dark mode) — opposite roles.
- surface-inverse
  - The dark panel on a light deck — title, divider, closing, split rails, code (was `--bg-dark`).
- scheme-dark-*
  - The dark-color-scheme inputs — the values `light-dark()` resolves to in dark mode (was `--dark-*`).
- Kept as-is
  - `--bg`, `--bg-alt`, `--border` are clear and short — renamed nothing for the sake of it.

---

<!-- _class: divider -->

## This panel is --surface-inverse too.

`Bookends · title, divider, closing`

The whole dark-bookend trio paints one surface token. Reading the component CSS now tells you exactly which dark it means.

---

<!-- _class: code -->

## And the code panel rides it as well.

```js
// --code-bg now resolves through --surface-inverse
function panel(scheme) {
  return scheme === "dark"
    ? "--scheme-dark-*"   // the color-scheme inputs
    : "--surface-inverse"; // the dark panel on a light deck
}
```

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Surfaces you can read at a glance.

`Phase 4 of 7 · see engineering/decisions/2026-06-11-universal-token-system.md`
