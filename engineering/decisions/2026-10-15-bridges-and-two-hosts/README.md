# Evidence for `2026-10-15-bridges-and-two-hosts.md`

| File | What it is | Note section |
|---|---|---|
| `layer-census.cjs` | Exports each deck to Marp, builds a layered, a flattened and a reference theme for its palette, renders each through marp-cli and compares every element's computed style | §3.1 |
| `layer-census-results.json` | One entry per deck, measured on `main` at `6e7c738`: palette, element count, `AvsC` (flattened vs reference) and `AvsL` (the veto) differing elements. `bundleMissingPalettes` lists palettes the deck's Marp bundle imports but does not ship (a P0 follow-up); the census read those from `dist/themes/` | §3.1 |
| `runtime-census.cjs` | The same comparison on one deck as an author sees it: rendered through the bundle's own `marp.config.cjs` (real allowlist, runtime loaded and settled, `::marker` included), adding today's unlayered sheet (D) and the theme stylesheet's size | §3.1 |
| `runtime-census-results/` | Its output for the gallery deck, screen and print media | §3.1 |
| `bridge-harness-sketch.mjs` | Runs the two conformance checks of `2026-10-17-bridge-spec-and-plugin-format.md` (text and pixel, per slide) for both bridge entry points: the Marp bundle through marp-cli, and the Calco `.pptx` through LibreOffice, each against Lattice's own PDF | bridge-spec note §6 |
| `bridge-harness-sketch-results.json` | Its output for six decks on `main` at `1828726`: per-slide recall, precision and RMSE for each bridge, and stage timings | bridge-spec note §6 |
| `layer-delta-census.cjs` | `runtime-census.cjs`'s D-vs-C comparison made cheap enough for every example deck (two renders instead of four, pages censused in parallel), with each engine and palette rule tagged so DevTools can name the rule that wins each changed property. `--experiment` adds C0 (layered with every specificity bump removed); `--tax` walks every element's matched rules for the specificity-tax count | §3.1, §3.6, §9 D2 (a), (c) |
| `layer-delta-aggregate.cjs` | Folds `layer-delta-census.cjs`'s per-deck lines into `layer-delta-results.json` | §3.1, §3.6 |
| `layer-delta-results.json` | Measured 2026-10-17 at `1828726`: the gallery baseline and 282 of the 283 example decks (`data-viz-gallery.md` has no theme). Per-deck changed-element counts (D vs C), the flips grouped by property family and source-file pair. The C-vs-C0 experiment and the specificity-tax walk ran on the 22 largest decks and the gallery only (the other 260 decks ran without `--experiment --tax` to fit the time) | §3.1, §3.6, §9 D2 (a), (c) |
| `author-css-designs.cjs` | Renders each deck with and without its own CSS under today's sheet and four candidate designs, and counts the (element, property) pairs the author's CSS wins in each | §4.4, §9 D2 (b) |
| `author-css-results.json` | Its output for the three example decks that carry a `<style>`. The gallery fixture (`--gallery-fixture`) was not run | §4.4, §9 D2 (b) |
| `measure-manifests.mjs` | Applies §5.3's field changes to the in-tree plugin manifests (eight on `main` at `6e7c738`) and counts lines before and after | §3.4 |

## Rerunning

`measure-manifests.mjs` needs nothing but Node:

```sh
node engineering/decisions/2026-10-15-bridges-and-two-hosts/measure-manifests.mjs
```

It treats `render.figureClasses` as derived. If that field stays (§5.3 leaves it open), add one to
four lines per drawn plugin.

`layer-census.cjs` needs marp-cli, the flattener and Playwright, which are deliberately not repo
dependencies. Its header gives the install line. It uses the spike's layer order (`root` before
`base`); the gallery was also run in the repo's declared order (`tools/build-css.js`, `base`
first) with identical results.

`layer-census.cjs` renders CSS only (`--html=false`), so the runtime's DOM is not covered there; `runtime-census.cjs` covers it for one deck at a time (about seven minutes on the gallery). `layer-delta-census.cjs` has the same setup plus `postcss-selector-parser`; its header gives the
install line. It reuses no state from the other two scripts, but `--validate` checks that its
untagged D, L and C sheets are byte-identical to `layer-census.cjs`'s. The examples-wide run used
four shards, one browser each (the first 22 decks with `--experiment --tax`, the other 260 without):

```sh
CENSUS_DIR=/tmp/census node engineering/decisions/2026-10-15-bridges-and-two-hosts/layer-delta-census.cjs \
  --experiment --tax --out=/tmp/census/delta-0.jsonl <decks>…
node engineering/decisions/2026-10-15-bridges-and-two-hosts/layer-delta-aggregate.cjs /tmp/census/delta-*.jsonl
CENSUS_DIR=/tmp/census node engineering/decisions/2026-10-15-bridges-and-two-hosts/author-css-designs.cjs \
  --gallery-fixture examples/finish-override.md examples/finish-backdrops.md examples/backdrop-register.md \
  --out=engineering/decisions/2026-10-15-bridges-and-two-hosts/author-css-results.json
```

The VS Code
run in §3.2 used a real code-server and marp-vscode; its method is the one recorded in
`engineering/gotchas/vscode.md` §"Does the marp-vscode webview execute `<script>`?".

`bridge-harness-sketch.mjs` needs Chromium (`CHROME_PATH`), pdftotext, pdftoppm, ImageMagick, LibreOffice and marp-cli 4.5.1 (not a repo dependency; pass its binary as `MARP=`). Its header gives the usage line. It exits with an error when a render, export or conversion step fails.
