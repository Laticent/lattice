---
status: proposed
summary: Turn the status/tone markers into an orthogonal STYLE axis — one uniform default, a deck-wide `stamp:`/`tone:` default + per-slide override, ~13 stamp styles + 3 tone styles, all palette-token colored
---

# Status-marker style variants

**Owner ask:** the status stamps (confidential/wip/draft/…) and tone markers looked
incoherent — a band here, a watermark there, a corner stamp elsewhere. After a
5-designs-per-marker gallery bake-off, the call is **not** to pick one look each but
to expose the treatments as **author-selectable style variants**, with one coherent
default and a deck-wide setting. This doc is the model + the architecture.

Confirmed in the gallery review:
- **Uniform default** (not per-marker signatures) — a mixed-marker deck must read as
  one family; the author opts *into* variety, never out of it.
- **Deck-wide `stamp:` default + per-slide override** (mirrors `finish:` / `mode:`).
- **Ship all styles, surface a boardroom subset first** in the drawer.

---

## 1. The model — two orthogonal axes per family

A marker today conflates *what it means* with *how it looks*. Split them:

| Family | SEMANTIC (existing tokens) | STYLE (new axis) |
|---|---|---|
| State | `confidential` `wip` `draft` `tbd` `redacted` `archived` `pinned` `revised` | `stamp-<style>` — the shape/placement |
| Tone | `tone-pass` `tone-warn` `tone-fail` `tone-skip` | `tone-<style>` — the shape/placement |

The semantic token sets a **label** + a **palette color**; the style token sets the
**shape**. They compose: `<!-- _class: confidential stamp-seal -->` = the Confidential
label, `--fail` color, seal shape. Because every color is a palette token
(`--fail`/`--warn`/`--accent`/`--text-muted`), every style is automatically on-brand
across themes and palettes (verified in the gallery's live palette switcher).

**Default:** state → `tab` (a clean, contained top-right corner tab); tone → `rail`
(the current left rail — least surprising). Markers differ only by label + color at
the default, so a no-config deck is coherent.

---

## 2. The var-driven mechanism

Each **semantic** marker sets two custom properties and nothing else:

```css
section.confidential { --stamp-label: "Confidential"; --stamp-color: var(--fail); }
section.wip          { --stamp-label: "WIP";          --stamp-color: var(--warn); }
/* … one line per marker … */
section.tone-fail    { --tone-color: var(--fail); }
```

Each **style** renders the marker from those vars — one rule per style, marker-blind:

```css
section::before, section.stamp-tab::before { /* TAB — the default shape */
  content: var(--stamp-label);   /* ← auto-gate: unset var → invalid → no pseudo */
  color: var(--on-accent); background: var(--stamp-color); /* … tab geometry … */
}
section.stamp-seal::before { content: var(--stamp-label); /* … seal geometry … */ }
```

`content: var(--stamp-label)` is the gate: on a slide with **no** state marker the var
is unset, `content` computes invalid, and the `::before` is not generated — so a style
rule never needs to enumerate the eight markers. One style = one rule, recolored per
marker for free. This is the same discipline that made the tone rail composable.

---

## 3. The hard part — pseudo-element allocation

A `<section>` has exactly **one `::before`, one `::after`**, and the engine already
spends both: pagination owns `div.lattice > section::after`; state stamps and `mark-*`
decorations want `::before`. The tone rail (2026-07-03 fix) deliberately moved to an
inset **`box-shadow`** to stop colliding with state `::before`. The style axis must
respect that budget:

| Channel | Owner | Consequence |
|---|---|---|
| `::before` | **state stamp** (all label styles: tab, notch, pill, bracket, seal, ribbon, flag, underline, dot, mark, veil, bar, pin) | A slide shows ONE state stamp — correct (a slide has one state). |
| `::after` | **pagination** (reserved) | Untouched. |
| `box-shadow` | **tone** (rail, edge, glow) + finish frame (already composed) | Tone styles must be box-shadow-shaped. |

**Therefore, by construction:**
- **State + tone coexist** (`::before` + `box-shadow`) — preserves the collision fix.
- **Tone v1 ships the box-shadow-shaped styles:** `rail` (default, inset left),
  `edge` (inset top band), `glow` (inset ring). The gallery's tone **chip** and
  **wedge** need a pseudo or a background layer that would collide with the state
  `::before` / pagination `::after` / tint backgrounds — they are **deferred** to a
  follow-up (a dedicated injected element is the clean fix, out of scope here). This
  is logged loud, not silently dropped.

---

## 4. The shippable style set

**State — `stamp-*` (13):** `tab` (default), `notch`, `pill`, `bracket`, `seal`,
`ribbon`, `flag`, `underline`, `dot`, `mark` (watermark), `veil` (overlay+corner
label), `bar` (redaction bar — label-hidden), `pin` (drop pin — label-hidden).
**Boardroom subset (drawer surfaces first):** `tab`, `notch`, `bracket`, `seal`, `pill`.

**Tone — `tone-<style>` (3 in v1):** `rail` (default), `edge`, `glow`.
The style tokens are disjoint from the semantic tokens (`tone-fail` = semantic,
`tone-rail` = style), so `tone-fail tone-edge` composes with no ambiguity.

---

## 5. Deck-wide default + per-slide override

Two front-matter registers mirroring `finish:` (`lib/core/resolve-finish.js`):

- **`resolve-stamp.js`** — `stamp: seal` → appends `stamp-seal` to every section via
  `deckClassPropagate` (`plugins.js`). A slide carrying its OWN `stamp-*` token
  overrides (the propagator skips the deck token, exactly as it does for finish/mode).
  `stamp: tab` is the baseline; an unknown value lints `unknown-stamp`.
- **`resolve-tone-style.js`** — `tone: edge` → appends `tone-edge` likewise. (Note:
  the `tone:` register sets the tone STYLE deck-wide; the per-slide *semantic* stays
  `tone-fail` etc.)

Per-slide override + the deck default both flow through the drawer's tri-state
provenance model already built for finish/mode — so a per-slide picker reads
"inherited (deck) / this slide / default" honestly.

---

## 6. Form-status reconciliation (supersedes the masthead-bay special-case)

The current form status Tile (`lib/forms/tile/status/status.css`) docks
confidential/wip/draft as a chip in the masthead bay, and 2026-07-03 added a corner-pill
fallback for masthead-less forms. The uniform style system **absorbs and simplifies
this**: the universal default is the corner **tab** on *every* layout (form or not),
so the masthead-less-vanishing bug can't exist and there is one placement model. The
masthead-bay dock is retained as an **opt-in style** `stamp-dock` (it's a genuinely
nice look where a masthead exists), not the default. This removes the `:has()`
masthead-bay coupling from the default path.

*(Deliberate visual change: masthead form layouts that previously auto-docked the chip
now show the corner tab by default. Flagged in the PR; a deck can restore the dock with
`stamp: dock`.)*

---

## 7. Build plan

1. **CSS** (`base.variants.css` + a new `base.stamps.css` if it grows): markers set
   `--stamp-label`/`--stamp-color`; the 13 `stamp-*` styles; tone `--tone-color` +
   `tone-edge`/`tone-glow` box-shadows alongside the rail. Retire the old per-marker
   `::before` designs. Reconcile `status.css` (dock → `stamp-dock`).
2. **Registers**: `resolve-stamp.js` + `resolve-tone-style.js`; wire into
   `deckClassPropagate` + all three render paths; lint vocab (`stampNames`,
   `toneStyleNames`) + `unknown-stamp`/`unknown-tone` lint.
3. **Vocab export**: `stampStyles` (+ boardroom flags) and `toneStyles` through
   `buildVocab` → `lintVocab` + `components.json`.
4. **Drawer**: a "Stamp style" control (boardroom subset first, rest under "more") and
   a "Tone style" control, both provenance-aware, in `SlideContext.tsx`.
5. **Docs + demo + tests + CHANGELOG**; a `examples/status-markers.md` gallery deck
   (+ PDF) showing every marker × the boardroom styles; unit tests for the registers;
   verify on the live browser Studio + PDF; maker-checker; PR.

## 9. Spectrum collision — Respect + Recolor (2026-07-03)

`tone: edge` originally painted a *separate* top box-shadow band, which fought the
**spectrum** — the rainbow brand bar every `<section>` carries on its top border
(`base.elements.css`), and which a `divider` slide carries as a *left* rail
(`divider.styles.css`). Red-teamed with an independent chair; the framed options were
(A) respect the spectrum, (B) make the spectrum deck-configurable, (C) shift tone to the
bottom/right edge. Findings that decided it:

- **C is a trap.** 10 of 13 state stamps already cluster top-**right**; the **bottom** is
  owned by the footer (bottom-left), pagination (bottom-right), and finish ghost-numerals
  (bottom-right). Both "free" edges are the busiest — moving tone there trades one
  collision for another. Tone stays **left** (its box-shadow *composes*, it never erased).
- **B is white-label, not a status fix.** A deck toggle that hides the brand bar to fit a
  transient status marker inverts the priority. A `spectrum:` register is a legitimate
  **white-label** feature (client-brand > Lattice-brand) but a *separate* PR (HARD RULE
  #17/#8) — not folded into the status work.
- **A, done by recolor, wins.** `tone: edge` now **recolors the spectrum itself** with the
  tone color (`border-top` solid `--tone-color`, `border-image: none`) — the exact move
  the `accent` modifier already makes (`shared.styles.css`), so it's precedent, not a new
  idiom. One edge, dual-purpose, zero new geometry. Gated on a semantic tone; a no-op
  where the spectrum is absent (dark/divider slides).

**Divider `::before` erasure (fixed in-scope).** The red-team surfaced a latent bug: the
divider's left spectrum rail was a `::before` — the *same* pseudo every state stamp owns —
so `divider confidential` erased one of the two. Fixed by moving the divider rail onto the
section **background** (a left gradient strip), which frees `::before` for the stamp.
box-shadow can't carry the rainbow gradient, so background (not box-shadow) is the right
layer — this also sidesteps any interaction with the tone rail's box-shadow composition.

## 8. Do-not-regress

- The tone rail stays box-shadow + backdrop-inset over finishes (2026-07-03).
- `tone: edge` recolors the spectrum (never a separate top band that fights it); it is a
  no-op where the spectrum is absent (dark/divider/accent slides).
- The divider left rail rides the section background, never a `::before` (keeps the
  `::before` free for state stamps — `divider confidential` shows both).
- State stamps never re-enter a pseudo shared with tone or pagination.
- Every stamp/tone color stays a palette token — no hex (HARD RULE #3).
- Masthead-less forms never render an invisible stamp (the tab default guarantees it).
- The white-label `spectrum:` register is a SEPARATE feature — never folded into this PR.
