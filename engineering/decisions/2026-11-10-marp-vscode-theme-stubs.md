---
status: shipped
summary: >
  Marp for VS Code re-packs every registered theme on every keystroke, and packing Lattice's 1.1 MB engine stylesheet was most
  of the preview's typing delay. The kit and the Export-to-Marp bundle now register directive-only STUBS with VS Code
  (lib/export/marp-vscode-stub.js) and the deck links a stylesheet the build pre-packs with marp-core, using the options the
  preview renders with (tools/build-marp-vscode-css.js). Measured in a real VS Code, a keystroke reaches the preview in ~0.3 s
  p50 instead of ~1.0 s, and every slide is pixel-identical (a parity test proves it for both hand-offs). marp-cli keeps the
  full themes. marp-core is a build-time devDependency only, with the marp-core and marpit pair every Marp for VS Code 3.x
  release bundles modeled too, because Marp's own rules differ between them (driven on all ten releases, 3.0.0 to 3.6.1).
---

# The VS Code preview registers theme stubs, and the deck links a pre-packed stylesheet

**Date:** 2026-11-10 · **Decided by:** the owner ("Kit + export bundle", "do it in this PR", "option 1": marp-core at build
time) · **Code:** `tools/build-marp-vscode-css.js`, `lib/export/marp-vscode-stub.js`, `vscodeThemeStubs` and `VSCODE_STYLESHEET`
in `lib/export/marp-bundle.js`, `tools/build-marp-kit.js` · **Held by:**
`test/integration/export/marp-vscode-css-parity.test.js`, `test/unit/tools/marp-vscode-cores.test.js`, `test/unit/tools/export-marp.test.js`,
`test/unit/tools/marp-kit.test.js`, `docs/src/components/studio/export/deck-export.marp.test.ts`.

## The problem

On every keystroke Marp for VS Code renders the whole deck again with marp-core, and marp-core re-packs every registered theme
on every render: it parses the theme, resolves its `@import`s, and scopes every rule to the preview's container. For Marp's own
themes that is cheap. For `lattice-min.css` (1.1 MB) it costs 700–1,200 ms per render, and the 1.5 MB of scoped CSS it emits is
then shipped to the preview again. That was most of the delay a person saw between a keystroke and the preview changing
(engineering/gotchas/vscode.md, "Typing is slow in the VS Code preview").

The theme never changes while someone types. Only Marp's packing of it was being repeated.

## What we do

Two halves, cut from the same themes so they cannot disagree:

1. **The stub.** VS Code registers, per theme, only what Marp needs to find it and size its slides: the `@theme` directive
   comment (with `@size`) and the palette's `@import` of the theme it extends (`stubOf`, lib/export/marp-vscode-stub.js). Marp
   re-packs that per keystroke in next to no time.
2. **The pre-packed stylesheet.** `tools/build-marp-vscode-css.js` runs marp-core at BUILD time with the options Marp for VS
   Code renders its preview with (`VSCODE_OPTIONS`: the `#__marp-vscode` container, the slide wrapper, inline SVG), packs each
   theme in full and packs its stub, and keeps the difference: exactly the rules the full theme added. Each palette's rules are
   scoped to `:where([data-theme="<name>"])` on the slide, so one file carries the engine and every palette. The deck links it
   once, at the end beside its scripts (`<link rel="stylesheet" href="…">`), and the browser keeps it across keystrokes.

marp-cli is unchanged: `marp.config.cjs` keeps registering the full themes, because marp-cli renders once and pays the pack
once.

## Keeping the cascade

A registered theme sits inside Marp's own `<style>`. Marp writes ten of its own rules BEFORE it: the slide box, the page number,
a heading default, print rules. After it come 36 more (math, emoji, advanced backgrounds), and then the deck's own CSS: a
global `<style>` and the `style:` directive. A `<link>` arrives after ALL of them. Left like that, every equal-specificity tie
flips to the engine. The first version shipped that way and the checker caught it: an author's `section h1 { color: … }` lost in
the preview while it won in marp-cli. The parity decks had no author CSS, so the test could not see it.

Two moves put every winner back:

1. **The linked rules are one type selector weaker.** `#__marp-vscode` replaces `div#__marp-vscode`, the same element
   (`belowTheAuthor`). Every tie with what came after the theme goes back to it, as before. Where the engine was ahead by one
   type selector, the tie now goes to the link, which is later in the page, so the engine still wins. Between two engine rules
   nothing changes, because all of them drop the same amount.
2. **What only order settles stays in the theme's slot.** The build writes it into the engine's stub (`pinnedRules`), which
   Marp packs in the theme's place:
   - each engine declaration that ties one of Marp's EARLIER rules (same specificity, same pseudo-element, subjects that can
     be the same element, properties in one family), because lowered it would lose a tie it used to win by order;
   - then, until nothing changes, every later engine declaration that ties a pinned one, including rules inside `@media`,
     `@supports` and `@container`, which are pinned with their whole at-rule;
   - every at-rule with no selector to weaken: the `@layer` order statement (the first statement names the order, and an
     author's `@layer` used to come after the engine's), `@keyframes`, `@property`.

   **Not `@font-face`**, measured in the real VS Code: the stub is registered from `.vscode/themes/`, where a face's
   `url(fonts/…)` names a folder that is not there. With the 52 faces in the stub, the preview's first render also beat the theme
   registration, and VS Code went on showing that unthemed render (its themed re-render waited, hidden, in the webview's pending
   frame). With them out, the first render is themed. So the faces stay in the link, beside the fonts they name. The cost is one
   case: a deck that redefines one of Lattice's OWN families (Outfit, Playfair Display, JetBrains Mono …) with its own
   `@font-face` gets Lattice's face in the VS Code preview, where marp-cli shows the deck's. A face under its own family name is
   unaffected.

   Today the stub is 21 KB, and Marp packs it in about 24 ms per render, against about 650 ms for the full theme. A palette rule that ties a pinned rule or one of Marp's earlier ones, or a palette at-rule settled by
   order, would lose too; palettes have no stub, so the build refuses one (`assertNoPaletteTies`). None does.

The tie test is deliberately loose (a shorthand and its longhands, a logical property and its physical twin, and `all` all
count as one), because pinning a declaration that did not need it changes nothing. The build checks itself: every pinned
declaration must pack the same in the stub. The parity test is the proof, and the second checker's `@layer` case is in it: an
author's `@layer components … @layer base …` resolves as it did with the theme registered, and fails the test when the engine's
order statement is left in the link.

| Hand-off | Stylesheet | Stubs | Link |
|---|---|---|---|
| Copy-and-go kit | `lattice-vscode-min.css` (dist/lattice-vscode-min.css) | `.vscode/themes/`: the engine's is dist/lattice-vscode-stub.css, a palette's is cut by `stubOf` | in `Sample-Deck.md` |
| Export-to-Marp bundle (CLI and Studio) | `lattice-vscode.css` (dist/lattice-vscode-bundle-min.css: the themes pass through `marpScopableCss(withoutEmojiFont(…))` first, as the bundle's own copies do) | `.vscode/themes/`: the engine's is dist/lattice-vscode-bundle-stub.css (a static asset), a palette's is cut by `vscodeThemeStubs` | in the trailer (`RUNTIME_SCRIPTS`), let through by the bundle config's exact-name allowlist |

**A Studio library theme keeps the full themes.** The pre-packed stylesheet is built from the SHIPPED palettes. A bundle that
carries a saved theme registers the full files with VS Code and its trailer has no link (`withRuntimeScriptsReport({ vscodeLink:
false })`): linking it there would apply the engine's rules a second time, after the saved theme's, and beat the theme wherever
it overrides one. That bundle is correct and as slow as before.

## Why marp-core at build time

Three ways to get "the CSS the preview would have built" were on the table: run marp-core at build time (chosen), re-implement
its scoping in our own build, or skip the scoping and hand-write selectors. Only the first is the preview's own code path, so
only the first stays right when marp-core's packing changes. It runs in the build alone: marp-core is a devDependency and
nothing in `lib/` requires it (HARD RULE #1 still holds; Marp is an export target, not a render path). The build pins it
exactly (4.4.0).

### Every Marp for VS Code in the range, not just the newest

A user's preview runs the marp-core and marpit **their** Marp for VS Code release bundles, not the build's. The ten 3.x releases
bundle four pairs:

| Marp for VS Code | marp-core | marpit |
|---|---|---|
| 3.0.0–3.2.0 | 4.0.1 | 3.1.2 |
| 3.3.0 | 4.1.0 | 3.1.3 |
| 3.4.0–3.5.1 | 4.3.0 | 3.2.1 |
| 3.6.0–3.6.1 | 4.4.0 | 3.2.2 |

The theme's own rules pack the same in all four (compared node by node). Marp's own EARLIER rules do not: marpit before 3.2.2
writes its `h1` reset as `section :is(h1, marp-h1) { font-size: 2em; margin-block: 0.67em }`, one type selector stronger than
3.2.2's `:where(…)`. The first build checked ties against 4.4.0 only, so the engine's plain `section h1 { margin: 0 }`, lowered
one type selector in the link, lost to the old reset: in Marp for VS Code 3.0.0 to 3.5.1 the title slide's heading took a
0.67em margin and its two paragraphs moved 43 px. The parity test passed, because it rendered with 4.4.0 too. Driving the real
preview on all ten releases found it.

So the build checks ties against Marp's earlier rules under all four pairs (`VSCODE_CORES` in the build): exact devDependency
aliases (`marp-core-4.0.1` … `marp-core-4.4.0`), each with its marpit pinned by package.json `overrides` to the version its
release bundles, and each checked to pack the three kit themes byte-for-byte like the copy inside that release. The earlier
rules come from a pack of the directive-only stub plus a marker rule, about 20 ms a pair, so the build stays at about 18 s.
The fix pins one more rule into the stub (`section h1`'s font and margin declarations, 120 bytes); `color` stays linked, so an
author's heading color still wins. The parity test now runs every sample-deck case under each pair, and fails on the first
build's stub (slide 1, under the three older pairs). `test/unit/tools/marp-vscode-cores.test.js` holds the aliases to their
rows and the pin to the old reset. A new Marp for VS Code release that bundles a pair not listed needs a row (its
package-lock.json names both versions).

## Evidence

**Speed, in a real VS Code** (1.145.2, Marp for VS Code 3.6.1, under xvfb; 22 keystrokes typed into a slide heading through the
extension API, every animation frame in the preview sampled; a fresh profile per run; three runs each):

| Slide typed on | Keystroke to visible, p50 | p90 | Main-thread blocking (long tasks, total) | Frames with the figure missing |
|---|---|---|---|---|
| Diagram, before | 997–1,156 ms | 1,453–1,552 ms | 2.7–3.0 s | 0 |
| Diagram, after (first cut: whole theme stubbed, link not lowered) | 267–302 ms | 391–426 ms | 0.62–0.94 s | 0 |
| Diagram, after (as shipped; two runs, a third produced no reading) | 290–301 ms | 458–465 ms | 0.82–0.92 s | 0 |
| Chart, before | 934–1,122 ms | 1,429–1,538 ms | 2.6–2.9 s | 0 |
| Chart, after (first cut) | 272–281 ms | 400–405 ms | 0.60–0.78 s | 0 |
| Chart, after (as shipped) | 297–349 ms | 437–481 ms | 0.86–1.05 s | 0 |

The shipped rows cost about 20 to 30 ms more at p50 than the first cut: the 21 KB stub Marp still packs per render (about 24 ms
in Node) plus run-to-run noise, the price of keeping an author's CSS winning. A run that "produced no reading" is the harness's
startup race (it opens the preview while VS Code is still loading the workspace), not the preview. "Before" already includes the runtime fix in engineering/decisions/2026-09-05-diagram-fence-flash.md §10, so the difference is
this change alone.

**Nothing a reader sees changes.** `test/integration/export/marp-vscode-css-parity.test.js` renders each deck twice with
marp-core and `VSCODE_OPTIONS`, once with the full themes registered and no link, once with the stubs and the link, runs the
real runtime in Chromium on both, and requires every slide's PNG to be the same bytes. It covers both hand-offs and four
decks:
- the kit's sample deck with CSS of the author's own (a global `<style>` and `style:`, which must still beat the engine);
- the sample deck in cuoio;
- the sample deck in cuoio-dark, a palette that `@import`s another;
- the 120-slide layout gallery in mustard at 4K, which also proves a stub keeps the deck's `size:`.

It caught three real defects on the way, and each showed as a different picture:
- a palette whose parent was not registered while its rules were cut: a fully unstyled dark deck;
- the author-CSS tie: the page number moved, until the build learned that `section:after`, with one colon, is a pseudo-element;
- a pinned rule Marp packs with a companion rule.

In the real VS Code the kit renders styled, and an author `<style>` added to the sample deck wins there, as it does in marp-cli.
**On every Marp for VS Code 3.x release** (3.0.0, 3.1.0, 3.1.1, 3.2.0, 3.3.0, 3.4.0, 3.5.0, 3.5.1, 3.6.0, 3.6.1, from Open
VSX), the sample deck was opened once with the setup before this change (full themes registered, no link) and once with the
shipped kit, and every element's box on all 13 slides, with each slide's computed background, color and font, was compared: all
identical on all ten, the zero-size `<link>` element aside. An author rule as specific as the engine's (`section.title h1`)
won on all ten.
The parity harness cannot see VS Code's own loading, which is how the `@font-face` problem above was found: only the real
preview showed it.

**One more fix the comparison found.** With the stylesheet arriving by `<link>`, Mermaid could measure a diagram before the
body font loaded and lay it out with the fallback font's widths (a 1,160-wide viewBox instead of 1,111). The diagram hydrate now
waits for the body font (`diagramFontReady`, capped at 1.5 s) before it measures. That race existed before this change, too,
whenever the font came late.

## What it costs

- One more file in each hand-off, 1.9 MB minified (the engine plus every palette). The kit and an Export-to-Marp bundle each
  grow by that much.
- The deck's trailer has one more line. Deleting it leaves the VS Code preview plain while marp-cli exports stay styled. Both
  READMEs name that symptom and the fix, and the runtime's console warning says which it is (no link, or a link to a missing file).
- The preview still packs the engine's 21 KB stub on every render: about 24 ms, against about 650 to 780 ms for the full theme
  (marp-core in Node, this machine).
- An author `@font-face` that redefines one of Lattice's own families loses in the VS Code preview only (see above).
- A build step (`build-marp-vscode-css.js`, about 18 s for both hand-offs) and five devDependencies: marp-core 4.4.0, and the four
  bundled pairs as aliases (about 1.7 MB in node_modules; they share the rest of their dependencies with 4.4.0).
- The parity test runs 26 cases instead of 8 (about 240 s locally; the integration tier is sharded in CI).
