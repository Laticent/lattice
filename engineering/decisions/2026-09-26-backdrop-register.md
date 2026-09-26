---
status: proposed
summary: Backdrop restraint (strength, clear-behind-content, spotlight) works only on a fabricated finish, only deck-wide, and only in the Studio, because #695 made it a baked layer of the finish and retired the author-facing `backdrop:` map. This proposes a finish-independent `backdrop:` register plus per-slide `backdrop-*` classes that override the baked value (slide beats deck beats finish), on every render path including the CLI. Partly supersedes the FINAL revision of 2026-07-01-finish-restraint-controls.md.
---

# The `backdrop:` register — restraint for any finish, on any slide

**Status:** proposed 2026-09-26. Design before code; no engine change yet.
**Partly supersedes:** the 2026-07-02 FINAL revision of
[`2026-07-01-finish-restraint-controls.md`](2026-07-01-finish-restraint-controls.md), which
retired the top-level `backdrop:` map. This note keeps that revision's *baked* layer and
brings back an author-facing override on top of it.

## 1. The symptom

An author who wants a quieter finish on one deck, or clean canvas behind a dense chart on one
slide, has no way to say so unless all of these hold:

| Condition | Why it is required today |
|---|---|
| The finish is a **fabricated** one | `backdropSlots` (`docs/src/components/studio/finish-generate.ts:582`) is the only code that writes `--fin-backdrop-*`. Built-in presets (atrium, halo, …) have no recipe, so `finish-override:` has nothing to merge into. |
| The change is **deck-wide** | `finish-override:` is a front-matter map. No class sets strength or a mask on one slide; the 07-01 note left "per-slide strength" as an open question (§10) and nobody answered it. |
| The deck renders **in the Studio** | `StudioShell.tsx:2011` regenerates the finish CSS from the merged recipe. The CLI renders whatever finish CSS is already embedded, so a hand-edited `finish-override:` does nothing there. |

So Fabricate's Strength slider, "Clear behind content" toggle and "Spotlight one area" toggle
describe the finish's **default** look well, and give the author no **per-use** control.

## 2. Why the retirement left this gap

#695 retired the `backdrop:` map on the grounds that backdrop is a design element of the
finish. That is right for the default: a finish designer should be able to ship a finish that
is already restrained. It is wrong as the only tier, because restraint also depends on the
*content*. A title slide, a dense table and a photo slide need different amounts of finish
under the same preset. Content is decided per deck and per slide, not per finish.

## 3. The mechanism is already finish-independent

`lib/base/base.finish.css` never mentions a preset in the restraint path:

- `section.finish > .backdrop { opacity: var(--fin-backdrop-strength, 1) }` (line 147)
- `section.finish > .backdrop > .backdrop-mask { background: var(--fin-backdrop-mask, none) }` (line 254)
- the clearance shape `--backdrop-clear-mask` and its hard `-opaque` export mirror live on
  `section.finish`, and both export flips (`@media print`, `.lattice-exporting`) swap the mask
  to its `-opaque` mirror.

Every finish slide gets the same `.backdrop` wrapper on all three render paths
(`lib/core/backdrop.js`, the runtime's `injectBackdrops`, and the splitter). So the new work is
a **second source** for those two values, not a new compositor.

## 4. The proposal

### 4.1 Three tiers, most specific wins

| Tier | Written as | Reaches |
|---|---|---|
| Slide | `<!-- _class: backdrop-40 backdrop-clear -->` | one slide |
| Deck | front matter `backdrop: 40 clear` | every finish slide |
| Finish | Fabricate's baked `--fin-backdrop-*` | every slide wearing that finish |

The deck value uses the slide vocabulary without the prefix: `backdrop: 40 clear` stamps
`backdrop-40 backdrop-clear` on every section, the way `lift: on` stamps `lifted`. A slide that
carries any `backdrop-*` token of an axis drops the deck's token for that axis, the same
slide-over-deck rule `lift:` uses (`plugins.js:416`). Strength and mask are separate axes, so a
slide can take the deck's strength and override only its mask.

### 4.2 The vocabulary

| Axis | Tokens | Meaning |
|---|---|---|
| Strength | `backdrop-20` `backdrop-40` `backdrop-60` `backdrop-80` `backdrop-full` | opacity 0.2 … 0.8; `full` restores 1 and discards a baked dim |
| Mask | `backdrop-clear` | the existing clearance ellipse |
| Mask | `backdrop-spot-<pos>`, `<pos>` ∈ `tl t tr l c r bl b br` | a fixed-radius spotlight window at one of nine anchors |
| Mask | `backdrop-open` | no mask; discards a baked clearance or spotlight |

Why discrete steps rather than any number: a class cannot carry a free value without an inline
style, and inline style from author text is a sanitizer surface (HARD RULE #22). Four steps of
20% and nine anchors cover what the Fabricate controls are used for; a finish that needs an
exact value still bakes it in Fabricate.

Two names are already taken and stay out of the vocabulary: `backdrop-none` (the back-compat
alias for `finish-none`) and `backdrop-mask` (the overlay element inside the wrapper, never a
section class). Hence `backdrop-open` and `backdrop-full` rather than a `-none` spelling.

`finish-none` stays the per-slide *off switch*. `backdrop-*` only restrains a finish that is
present, and is inert on a slide without one.

### 4.3 The CSS

A separate token namespace, read first, so no specificity contest with a fabricated finish's
`section.finish.finish-<slug>` (0,3,1) rule:

```css
section.finish > .backdrop {
  opacity: var(--bd-strength, var(--fin-backdrop-strength, 1));
}
section.finish > .backdrop > .backdrop-mask {
  background: var(--bd-mask, var(--fin-backdrop-mask, none));
}
section.backdrop-40 { --bd-strength: 0.4; }
section.backdrop-clear {
  --bd-mask: var(--backdrop-clear-mask);
  --bd-mask-opaque: var(--backdrop-clear-mask-opaque);
}
section.backdrop-open { --bd-mask: none; --bd-mask-opaque: none; }
/* both export flips gain one line: */
@media print { section.finish { --bd-mask: var(--bd-mask-opaque); } }
```

When no `backdrop-*` class is present, `--bd-mask-opaque` is undefined, so the print flip makes
`--bd-mask` invalid and the `var()` fallback reaches the baked value. A deck with no new token
renders **byte-identical**. That is the acceptance test for the no-opt-in path.

### 4.4 Anchor slides

The bug that made bookends a concern (#1656: the clearance mask painted a light ellipse over a
dark title slide) is fixed at the root by `--fin-canvas`, which every mask already paints in.
This register reuses those masks, so a deck-wide `backdrop: clear` on an inverse or accent
bookend paints the bookend's own canvas, not the deck's. The demo deck (§6) renders all
bookend kinds in both modes to prove it rather than assume it. The `bookend-finish-contrast`
lint stays as it is.

### 4.5 `finish-override.backdrop`

Keep it working. It still tunes the baked tier of a fabricated finish, and removing it would
break saved decks. The register sits above it: when both are set, the register wins, because
it is the more specific statement of intent. The `retired-backdrop-key` lint narrows to the
old *map* form (an indented child under `backdrop:`) and its fix text points to the scalar.

## 5. Surfaces

- **Engine:** `lib/core/resolve-backdrop.js` (the name the retired resolver used, reborn as a
  scalar register like `resolve-lift.js`), wired into the three paths that already read `lift:`.
- **CSS:** `lib/base/base.finish.css`, the rules in §4.3.
- **Lint:** `lib/authoring/lint-core.js` — unknown token, `backdrop-*` on a slide with no finish
  (info), and the narrowed retired-map warning.
- **Studio:** a Backdrop row in deck settings and in `SlideContext.tsx` (strength steps + mask
  choice), with the same provenance badge the finish row shows (slide / deck / finish).
- **Docs:** `lib/base/base.registers.docs.md` § finish gains a `backdrop:` subsection; the
  07-01 note gets a pointer to this one.

## 6. Verification

- Unit: resolver, slide-over-deck per axis, lint rules, byte-identical render of every
  committed deck without the key.
- Demo deck `examples/backdrop-register.md` (HARD RULE #9): a built-in finish and a fabricated
  one, each at deck level and overridden per slide, plus title, section and closing bookends.
- **Export sign-off:** this alters exported bytes for decks that opt in, so the PDF of the demo
  deck goes to the owner in dark and light before merge.
- Maker-checker: engine CSS + three render paths is blast radius, so one checker agent.

## 7. Open questions for the owner

1. The register name: reuse `backdrop:` (matches the Fabricate header and the wrapper element)
   or pick a fresh word to avoid confusion with the retired map.
2. The strength steps: 20/40/60/80, or a finer 10% grid.
3. Whether `finish-override.backdrop` stays supported indefinitely (§4.5) or is deprecated with
   a migration warning.
