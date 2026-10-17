---
status: in-progress
summary: >
  Native `@scope (article.lattice)` can replace the pack's selector rewriting for the preview sheet.
  Behind an opt-in flag, it matches the pack on every measurement we ran: 0 differing elements across 32
  themes and 16 example decks, 0 differing pixels on all 14 slide documents the real Studio built, and
  the exported sheet is byte-identical. Two things stop us flipping the default: other code is written
  against the packed shape and its specificity, and Firefox below 146 has no `@scope`.
---

# `@scope` delivery for the preview sheet (2026-10-17)

Status: in progress (a prototype). `opts.scoping: 'scope'` is opt-in; the default render and the exported (flat) sheet
are unchanged. The owner chose Firefox 146+ as the browser floor on 2026-10-17.

Parents: `2026-09-24-one-style-delivery-spine.md` (the delivery modes), the `:where(:root)` entry in
`engineering/gotchas/lattice-internals.md`, PRs #2705, #2720 and #2735.

## 1. The answer

**Yes. `@scope` removes the cause of the "slide inside a slide" bug instead of guarding against it.**

The pack rewrites every selector to start with `article.lattice > section`, and it treats only a
literal leading `section` as the slide. Any other way of naming the slide becomes a slide descendant,
which matches nothing. Three PRs in a row deleted rules or wrote guards for that one trap.
`@scope (article.lattice)` gives the same containment and rewrites no selector, so a rule means what
it says. `:where(section.finish) .panel`, `.x section.x` and `:is(section.map, figure.chart-frame) .z`
all work as written.

## 2. What changes

`scopeTheme` (`lib/engine/css.js`) wraps the style rules in one `@scope` block and does one rewrite:

| Input | Output | Why |
|---|---|---|
| leading `:root`, `section:root` | `:where(:scope > section):not([\20 root])` | `:root` means the document in the CLI and the slide here (the tokens live on it) |
| `:where(:root)` | unchanged | a document default cannot match inside `@scope`, and must not (see §4) |
| anything else | unchanged | |
| `@font-face`, `@keyframes`, `@property`, `@import` | hoisted out of the block | they are not style rules and cannot live in `@scope` |

The Marpit `::after` pagination mask still runs, because `scopeTheme` reuses the pack's rule walker.

### The `:root` mapping needs the pack's specificity guard

The first version mapped `:root` to `:scope > section`. That has specificity (0,1,1), the same as
`section.dark`, so a theme's later `:root { color-scheme: light }` pin beat `section.dark` and 7 of
120 gallery slides rendered light instead of dark (`a11y-*` themes). The pack avoids this with a
never-matching `:not([\20 root])` that holds the slide at `:root`'s (0,1,0). The same guard now sits
in the `@scope` mapping. `scope-delivery.test.js` pins it.

## 3. Measured

All in Chromium; every number is from this branch.

| Check | Result |
|---|---|
| Gallery deck (4K, 120 slides, 5,635 elements, 42 properties), all 32 themes, pack vs `@scope` | 0 differing elements in all 32 |
| 16 example decks × `indaco`, `cuoio-dark` | 0 differing elements in all 32 runs |
| Flat (exported) sheet, every run above | byte-identical |
| Rendered HTML, every run above | identical |
| Preview sheet size | 12.1% to 12.2% smaller |
| Real Studio, built docs site, `indaco`, 7 slides, light and dark: the document the preview frame built, re-rendered standalone at 1280×720 | 0 differing pixels on all 14 |

### The Studio check took three tries, and the first two measured the wrong thing

Screenshotting the Studio's preview region read as "`@scope` intermittently blanks the slide". It did
not. The Studio can paint a loading placeholder over the frame (a blurred bake, or a flat navy frame)
while the frame's DOM is already correct, and a headless screenshot catches whichever is on top.
**Pack produced the same blank captures as `@scope`**, 2 of 6 loads each, with the frame's DOM
correct every time (text present, 1280×720, right background). A pack-vs-pack control first read 0
differences and then did not, so a clean control run does not prove an instrument is stable.

The method that works: take the document the frame built (its HTML plus every stylesheet's rules)
and re-render it standalone. It measures the Studio's own output and none of the compositing.

## 4. What stays hard

### `:root` rules are not all the same kind

A token block on `:root` belongs on the slide. A `color-scheme` default belongs to the host, which
owns `<html>` and forces a dark mode on it. A `color-scheme` set on the slide stops it inheriting
that. Under the pack this was an accident (the `:where(:root)` rule happens to be dead); under
`@scope` it is the standard's own behavior. Any `:root` rule that is a document policy and not a
token needs the same decision, and nothing checks that today.

### Specificity falls

`@scope` adds no specificity (the scope root is `:where(:scope)`); the pack's prefix adds (0,1,1).
Code written against the packed shape is where this shows:

- `lib/engine/slides.js:325` states a specificity it has to beat.
- `lib/finishes/finish-generate.js:503` lifts a rule to (0,3,2) under `article.lattice >`.
- `docs/src/lib/compose/inline-objects.ts:545` writes pill rules under `article.lattice > section`.
- `docs/src/components/chart-detail-layer.tsx:76-168` matches `article.lattice > section …` from a host card.
- `docs/src/playground/snapshot-cache.js:320`, `share-export.ts:745` and `frame-css.js:33` read the packed shape.
- `tools/check-ownership.js` carries several gates that assume it.

The preview iframe is a separate document, so host CSS cannot reach into it. That is why the real
Studio check passed. A surface that inlines slides into a page with other CSS (component pages,
embeds) is not covered by any measurement here.

### Browser floor

| Browser | `@scope` |
|---|---|
| Chromium 141 | yes |
| WebKit (Playwright's Safari 26 build) | yes |
| Firefox 142 (our gecko e2e project) | **no**: `CSSScopeRule` undefined, rule does not apply |
| Firefox 146+ | believed yes (my recollection of the release; not run or checked here) |

With the owner's floor of Firefox 146+, the gecko e2e project has to move to a Playwright whose
Firefox is 146 or newer before the default can change.

## 5. Not measured

- Hydrated charts, Mermaid, and anything the runtime draws after load. The static diff cannot see them.
- Print and PDF from the preview sheet. Exports use the flat sheet, which this change leaves alone.
- Read · Article, which lifts figures out of their slides and needs the flat sheet's written arms.
- Any host that inlines slides next to its own CSS.
- Any non-Chromium browser on the real Studio. WebKit and Firefox 142 were only asked whether `@scope` applies, on a toy page.
- The other 31 themes on the real Studio (the static diff covers all 32).

## 6. Rollout, if the owner wants it

1. Migrate each consumer in §4 from the packed shape to something that does not depend on the
   prefix's specificity, one PR each, with the real-surface check that consumer owns.
2. Run the document-extraction check from §3 on every theme, not only `indaco`.
3. Move the gecko e2e project to Firefox 146+.
4. Flip the default for the preview. Keep the flat sheet's pack: it ships each re-scoped arm as
   written, and its bytes are an export artifact.
5. Delete the css-scope guard and the `:where(:root)` sanction from PR #2735, which `@scope` makes
   unnecessary.

Steps 1 and 4 change what users see on surfaces this note did not measure. Each needs the owner's
sign-off on rendered output.
