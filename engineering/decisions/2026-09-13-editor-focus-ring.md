---
status: shipped
summary: The deck editors draw the site's 2px accent focus ring as a z-ordered pseudo-element; the caret alone met WCAG 2.4.7 but left the largest text surface outside the site's focus language.
---

# The deck editors draw a focus ring again — the site's, not CodeMirror's

**Decision: an editor that fills a stable pane draws a 2px `var(--accent)` ring while
focused, flush with its own edge.** It lives in `docs/src/lib/editor-chrome.js`, so the
Playground's deck editor, the Studio's deck Editor and the component-page Specimen
cannot disagree about it. An embedded `CodeField` declines it — see § The split.

This reverses a call made without review in #2174, which replaced CodeMirror's default
ring with a bare `outline: none` on the argument that the caret is a text field's focus
affordance. That argument is correct and is not why the ring is back.

## What #2174 actually removed

`@codemirror/view`'s base theme paints `&.cm-focused { outline: 1px dotted #212121 }` —
a fixed near-black, on every palette. On a dark palette it draws near-black on
near-black, so it looked like a focus indicator without being one. Suppressing it was
right. The Studio's editor had suppressed it since it was written.

## The three measurements that settled what replaces it

**1. The editors were outside the site's focus language by accident, not by
decision.** `docs/src/styles/native-widgets.css` carries the site's one focus ring —
`outline: 2px solid var(--accent)`, `outline-offset: 2px` — and selects
`:where(a, button, input, select, textarea, summary, [tabindex])`. CodeMirror's
`.cm-content` is a `contenteditable` div with **no** `tabindex`, so it matches none of
those. Measured on the real Playground by walking every stylesheet in the document and
testing each outline-bearing selector against `.cm-editor` and `.cm-content`: **zero
rules of ours matched either element.** What painted the outline was
`@codemirror/view`'s own base `.cm-content { outline: none }` — a third-party default
nobody here chose.

**2. The caret alone does meet WCAG 2.4.7 (AA).** W3C's Understanding document for
that criterion names the text field case directly: "When text fields receive focus, a
vertical bar is displayed in the field, indicating that the user can insert text."
So the ring is not a conformance repair, and the PR should not claim one.

**3. The "the caret can be off-screen when focus lands" case does not occur.**
CodeMirror scrolls the caret back into view on refocus. Measured on the real
Playground with a document taller than its pane: caret at the end, blur, force
`scrollTop` to 0, refocus — `scrollTop` goes 0 → 1266 and the caret's line is back
inside the scroller's rect. This was the strongest argument for the ring, and the
browser refuted it.

## So why add it

Consistency, stated plainly: **every other focusable on this site says "focus is here"
the same way, and the editors — the largest text surfaces we ship — said it with a
13.5px blinking bar and nothing else.** A user who has learned that an accent
rectangle means focus gets no such signal on the one control they will spend the most
time in. That is a real cost, and it was being paid because a selector list happens not
to include `contenteditable`, which is not a reason.

## It is a pseudo-element, not an `outline`, and that is forced

`outline-offset: -2px` draws the ring inside the border box — where CodeMirror's own
DOM paints over it. `.cm-scroller` is `position: relative; z-index: 0`, so it opens a
stacking context that paints after `.cm-editor`'s outline, and inside it `.cm-gutters`
is `position: sticky; z-index: 200` with an opaque `var(--bg)`.

Measured on the real focused Playground by injecting `outline: 2px solid red;
outline-offset: -2px` with the pseudo-element disabled, then sampling the top edge:
`x = 2, 10, 20, 30` read `250,247,242` (the canvas — erased), `x = 36` the gutter
border, `x = 40 …` red. **The gutter erases the whole 37px left band, both left corners
included.** An outward `outline-offset: 2px` is no escape either: `.pg-editor-host` is
`overflow: hidden`, so the ring would be clipped on the pane-adjacent sides instead.

So the ring is a positioned child that can be ordered above the scroller:

```js
'&.cm-editor.cm-focused::after': {
  content: '""', position: 'absolute', inset: '0',
  zIndex: '1', border: '2px solid var(--accent)', pointerEvents: 'none',
}
```

`z-index: 1` is enough — the competitor in `.cm-editor`'s stacking context is the
scroller's `0`, not the gutter's `200`, whose number is scoped to the context the
scroller opens. It stays under `.cm-panels` (300) and `.cm-tooltip` (500), so search
and lint tooltips still paint over it. `.cm-editor` is `position: relative !important`
in the base theme, so `inset: 0` is anchored on every surface. The painted pixels are
identical to an inset outline; only the paint order differs.

## Two channels, and missing one is a defect that shipped here

`outline: 'none'` **suppresses** CodeMirror's base dotted ring; the `::after`
**draws** ours. The first cut replaced the suppression with the ring instead of adding
to it, so the base rule came back: two rings, the site's accent with a near-black
dotted one 1px outside it. It was invisible on the Playground and the Studio, whose
panes clip it, and painted on the component-page Specimen, whose host is
`overflow: visible` — pixel row `33,33,33 | 143,136,125 | 33,33,33 …` sitting above the
accent row. An independent checker found it. The same cut had also deleted two
page-level suppressors (`.pg-editor-host .cm-editor.cm-focused` in `playground.css`,
`.specimen-editor-host …` in `components.css`), which was correct — they were duplicate
owners — but left nothing in their place.

## The split: an embedded `CodeField` declines the ring

`docs/src/components/studio/editor-theme.ts` exports two themes off one builder;
`focusRing` is the only difference. The deck Editor takes `true`, `CodeField` takes
`false`, for two measured reasons:

- **Three of its five call sites already paint a focus affordance.** LayoutStudio's two
  fields and Fabricate's manifest field sit in `rounded-lg border border-border …
  focus-within:border-[var(--accent)]` boxes. Measured: host radius 8px, host border
  `rgb(122,90,16) 1px` from `focus-within`, plus our square 2px ring 1px inside it — a
  second, square indicator cutting across the rounded one.
- **CraftLab's host scrolls the editor.** `.craft-lab-editor` is `max-h-[26rem]
  overflow-auto` with no definite height, so `.cm-editor` grows to the whole document
  (measured: `clientHeight` 415 against `scrollHeight` 846). An inset ring anchored to
  the editor scrolls its top and bottom edges out of view — the ring-with-a-side-missing
  this record rejects an inset outline for, reintroduced one surface over.

Declining the ring never means declining the suppression: `editorChrome` kills the
dotted default on every surface, ring or no ring.

**One `CodeField` host paints nothing at all** — Fabricate's Theme CSS field
(`Fabricate.tsx:1077`, `min-h-[320px] flex-1`). That is the status quo, not a
regression from this change, and it is named here rather than fixed: giving three other
surfaces a focus treatment is a wider decision than this one.

## Two other deviations, both forced

**The ring is flush with the editor's edge** where the site's sits 2px outside, because
the editor fills its pane inside an `overflow: hidden` host and anything drawn outward
is clipped. `.pg-rail:focus-visible` in `playground.css` already makes the same move for
the same reason.

**There is no `:focus-visible` arm, because it would change nothing.** Browsers treat a
text-editing surface as always focus-visible — measured: `.cm-content` matches
`:focus-visible` after a plain mouse click. A native `<textarea>` on this site already
rings on click for the same reason, so ringing on click *is* the site's behavior.

## Contrast

`--accent` against `--bg` is the ring's contrast question (WCAG 1.4.11 asks 3:1 of a
focus indicator against adjacent colors). Read off the live Playground on all 18
palettes in both color modes — the painted `border-top-color` of `.cm-editor::after`,
not the token file: 36 readings, every one tracking `--accent` at 2px, **minimum 5.24:1
(carbone/light)**, none under 3. `editor-selection-parity.spec.ts` holds that floor per
palette, per surface, reading the same property.

The ring's *inner* side is over `--bg`; its outer side is the editor's own edge, so the
color beyond it is whatever abuts the pane (the Studio's pane border reads
`rgb(143,136,125)`). The spec checks the inner neighbor, which is the tighter of the two
on every palette measured.

## What it does under forced colors

`forced-colors: active` forces a pseudo-element's `border-color` like any other, so the
ring survives as a 2px system-colored rectangle — measured in Chromium emulation:
`2px solid rgb(0,0,0)` on a white canvas. That is better than the status quo, which left
only the caret. **UNVERIFIED on real Windows High Contrast** — Playwright's
`forcedColors` is emulation (HARD RULE #23).

## Known gap, off the path

The Studio's **Compose** view runs ProseMirror, not CodeMirror
(`ComposeView.tsx:9`), so `editorChrome` never touches it, and its `.ProseMirror` host
is a `contenteditable` with no `tabindex` — the same selector-shape exclusion this
record calls an accident. After this change the Studio's Write view has a Markdown
editor that rings and a Compose editor that does not. Pre-existing, off the path of this
change, and logged rather than pulled in (HARD RULE #18).

## What would reverse this

A surface where the ring is wrong rather than merely large. `editorChrome` now takes
`focusRing` as a parameter, so that is a declared argument at the call site rather than
a second fork — which is how the `CodeField` split was made.
