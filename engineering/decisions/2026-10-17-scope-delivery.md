---
status: proposed
summary: >
  Native `@scope (article.lattice)` can deliver the preview sheet with the same rendering as the
  selector-rewriting pack (0 differing elements on 32 themes and 16 decks, 0 differing pixels on 14 slide
  documents the real Studio built), but it does not remove the "slide inside a slide" bug class, and it
  breaks or changes four other things. The owner parked it on 2026-10-17 and chose a small packer fix
  instead. The prototype is on branch claude/scope-pack-prototype (c74fa29); no engine code ships.
---

# `@scope` delivery for the preview sheet: measured, then parked (2026-10-17)

Status: proposed, and parked by the owner on 2026-10-17. No engine code from this note ships. The
prototype is commit `c74fa29` on `claude/scope-pack-prototype`, kept for reference.

Parents: `2026-09-24-one-style-delivery-spine.md` (the delivery modes), the `:where(:root)` entry in
`engineering/gotchas/lattice-internals.md`, and PRs #2705, #2720 and #2735.

## 1. The answer

**`@scope` renders the existing sheet faithfully. It does not make the bug class go away.**

The pack prefixes every selector with `article.lattice > section` and treats only a literal leading
`section` as the slide. Any other way of naming the slide becomes a slide descendant, which matches
nothing. We hoped `@scope (article.lattice)` would end that. It ends one shape of it:

| Selector | pack | `@scope` |
|---|---|---|
| `:where(section.finish) .panel` (slide named in a leading `:where()`) | matches nothing | **matches** |
| `:is(section.map, figure.chart-frame) .z` | matches (the pack distributes it) | matches |
| `.x section.x` (an ancestor class before the slide) | matches nothing | **still matches nothing** |
| `:where(.lattice-exporting) section.finish` | matches nothing | **still matches nothing** |
| `:where(.a) > section.x` | matches nothing | **still matches nothing** |

Inside `@scope`, a selector without `:scope` is read as `:scope <selector>`, so every compound in it
must sit inside `article.lattice`. An ancestor outside the scope root cannot be named. The rules
that remain dead under `@scope` are the ones the css-scope guard (#2735) catches, so `@scope` would
not let us delete that guard.

The one shape `@scope` rescues can be rescued in the pack with a small change (§6), without a
browser floor or any consumer migration. The owner chose that.

## 2. What the prototype did

`scopeTheme` (`lib/engine/css.js` on the prototype branch) wrapped the style rules in one `@scope`
block behind an opt-in `opts.scoping: 'scope'`. It rewrote one thing, a leading `:root`, and hoisted
the at-rules that are not style rules (`@font-face`, `@keyframes`, `@property`, `@import`). The
default render and the exported (flat) sheet were unchanged.

### The `:root` mapping needs the pack's specificity guard

Mapping `:root` to `:scope > section` gave specificity (0,1,1), the same as `section.dark`, so a
theme's later `:root { color-scheme: light }` pin beat `section.dark` (7 of 120 gallery slides,
`a11y-*` themes). The pack avoids this with a never-matching `:not([\20 root])` that holds the slide
at `:root`'s (0,1,0). The prototype copied that guard.

## 3. What was measured (Chromium, on the prototype)

| Check | Result |
|---|---|
| Gallery deck (4K, 120 slides, 5,635 elements, 42 properties), all 32 themes, pack vs `@scope` | 0 differing elements in all 32 |
| 16 example decks × `indaco`, `cuoio-dark` | 0 differing elements in all 32 runs |
| Flat (exported) sheet and rendered HTML, every run above | byte-identical |
| Preview sheet size | 12.1% to 12.2% smaller |
| Real Studio, built docs site, `indaco`, 7 slides, light and dark: the document the preview frame built, re-rendered standalone at 1280×720 | 0 differing pixels on all 14 |

The independent checker re-ran these on themes and decks it chose, with a wider property set
(including `::before`, `::after` and `::marker`), and got the same 0. It also confirmed that the
default render is byte-identical to `main` over 108 runs.

## 4. What the review found (red team, Munger inversion, independent checker)

My first version of this note said `@scope` "removes the cause" and that `.x section.x` "works as
written". Both were wrong; my test only checked that the selector text came back unchanged. The
reviews found:

1. **Ancestor-led selectors stay dead** (§1). High.
2. **A `<section>` an author nests inside a slide gets the whole slide treatment.** A bare `section {}`
   rule used to become `article.lattice > section` (direct children only); under `@scope` it matches
   every section inside the article. Measured on `indaco`: the nested section got padding 88px 64px, a
   white background, `display: flex`, `container-type: size` and `overflow: hidden`, and its content
   box collapsed to 0 height. The gallery has no nested section, so the 0-difference sweeps could not
   see it. The repo expects nested sections: `lib/runtime/index.js:1438` and `:1740` filter them,
   `lib/packages/code-door-fence.mjs:149` warns about one, and `share-export.ts:750` unwraps to
   `section:where(:not(section *))` on purpose. The fix is to write a leading `section` as
   `:where(:scope) > section`, which ends the "no selector rewritten" claim.
3. **Code that walks the stylesheet's rule list does not understand `CSSScopeRule`.**
   `docs/src/lib/compose/pill-sheet.ts:47-48` (`collectFrom`) recurses only into `@media`, `@supports`
   and `@container`, so Compose's inline pills get zero rules. The Playground first-paint snapshot
   (`docs/src/playground/snapshot-cache.js:187-219`) prefixes each rule with `.pg-ssr-shell` inside a
   kept `@scope` block, where it can never match, and its token probe runs at document level where
   `:scope` is `<html>`: the instant shell paints unstyled and the broken snapshot is cached in
   localStorage.
4. **The Studio's own exports use the preview sheet, not the flat one.** `share-export.ts:151` passes
   `out.css` into `DeckRender.css`, and `docs/src/components/studio/export/deck-export.js:432` (`createCaptureFrame`) rasterizes from it for the PDF, PPTX and
   PNG set. With the opt-in flag set in `render-engine.ts`, those exports already used `@scope`. An
   export-byte change needs the owner's sign-off, and my first note said exports were untouched.
5. **A browser without `@scope` drops the whole theme, with no error.** Only the scaffold box and
   hoisted `@font-face` survive: raw Markdown in a correctly sized box. `render-engine.ts` had no
   feature detection. The caniuse data in `docs/node_modules` (caniuse-lite 1.0.30001799) gives Chrome
   118+, Safari and iOS Safari 17.4+, Firefox 146+, and about 9.7% of global usage without it. That
   includes iPhones that stop at iOS 16 and Firefox ESR 140, not only Firefox 142 (our gecko e2e
   project, where I confirmed `CSSScopeRule` is undefined).
6. **A stray `}` in theme CSS ends the `@scope` block early**, so later rules apply to the host page
   unscoped (`body{…}`, `#host{…}`). The pack contains them because every selector carries the prefix.
   A bad `url(a}b)` can also swallow the `@scope` opener, and the whole theme vanishes. Deck markdown
   cannot reach `scopeTheme` today, so the reach is a host that inlines slides next to its own CSS.
7. **Smaller:** the `@layer` hoist arm can never match (`\b` after `;`); `scopeSelector` leaves `(` out of
   the `:root` lead set that the pack includes, so `.dark :root`, `:is(:root, .z)` and `:not(:root)`
   behave differently (none occur in shipped CSS); the single-slide render memo key ignored the
   scoping mode.

Specificity also falls: `@scope` adds none where the pack's prefix adds (0,1,1). Code written against
the packed shape is where that shows: `lib/engine/slides.js:325`, `lib/finishes/finish-generate.js:503`
(reasons about an engine rule at (0,3,2); under `@scope` it is (0,2,1)), `inline-objects.ts:545`,
`chart-detail-layer.tsx:76-168`, `frame-css.js:33`. The inversion also found the best argument *for*
`@scope`: for an author override of higher specificity, the preview moves toward the CLI, because the
CLI's unwrapped sheet is at written specificity.

## 5. Not measured

- Hydrated charts, Mermaid, and anything the runtime draws after load.
- Print and PDF from the preview sheet; Read · Article; any host that inlines slides next to its own CSS.
- Firefox 146+ (the support claim comes from caniuse data, not a run), and any non-Chromium browser
  on the real Studio.
- The other 31 themes on the real Studio (the static diff covers all 32).

## 6. What the owner decided, and what comes next

- **`@scope` is parked.** If it is revived, the work is: the leading-`section` rewrite, feature
  detection with a fallback to the pack, an opt-in limited to the preview (not exports), a scanner
  that fails safe to the pack, fixes for `pill-sheet` and `snapshot-cache`, a browser floor decision
  that names iOS and ESR, and the real-Studio check on every theme. **The css-scope guard stays**: it
  catches the shapes `@scope` does not fix.
- **The packer is fixed instead**, in its own PR: `packSelector` treats a leading `:where(section…)`
  whose every arm starts with `section` as naming the slide, and writes `article.lattice > ` before
  it. That keeps the `:where()` zero-weight the author wrote, needs no browser floor, touches no
  consumer and leaves export bytes alone. Ancestor-led shapes stay dead and stay guarded.

## 7. The instrument lesson

Screenshotting the Studio preview read as "`@scope` intermittently blanks the slide". It did not: the
Studio paints a loading placeholder over the frame while the frame's DOM is already correct, and a
headless screenshot catches whichever is on top. The pack produced the same blank captures at the same
rate. The method that worked was to take the document the frame built (its HTML plus every sheet's
rules) and re-render it standalone. See the gotcha in `engineering/gotchas/docs-site.md`.
