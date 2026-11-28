# Coda on Marp, re-verified at the shipped code (2026-11-28)

PR 3362 ("coda everywhere") was checked in a real VS Code at an earlier head. Three merges from `main` and two CLI fixes
followed, and they regenerated the CSS Marp loads and changed `lib/core/carousel.js`. This folder is the re-run at the
merged code (`2aee2ef`), on the real surface. The summary is in `2026-11-20-coda-and-marp-parity.md` §10.

## Surface

VS Code desktop 1.142.0 (Electron, under xvfb) with marp-vscode 3.6.1 from Open VSX, driven by
`tools/vscode-preview-probe.mjs`. Each deck is exported with `npm run export:marp` (which compiles `@meta` records into
Marp's `_class` comments) and opened two ways: as its own bundle, and re-pointed at `dist/marp-kit` by
`tools/vscode-harness/kit-deck.mjs`. The palette is set to `cuoio` in the deck's own front matter, so the engine and Marp
use the same one.

## Method

`tools/vscode-harness/probes/coda-parity.mjs` reads every slide in the preview: the key insight, the note, the source
line, and whether each coda cell sits inside the slide. `tools/vscode-harness/coda-engine-read.mjs` reads the engine's
own `.html` render of the same deck with the same function. A run passes when every beat matches the engine's text
exactly and no cell falls outside its slide (runtime on), or when the kit's notice draws and every beat's words are
still on the slide (strict).

    node tools/vscode-harness/coda-engine-read.mjs deck.md > expect.json
    npm run export:marp -- deck.md out
    LATTICE_PROBE_WIDE=1 PROBE_LEVEL=disable PROBE_EXPECT=$PWD/expect.json PROBE_OUT=$PWD/shots \
      node tools/vscode-preview-probe.mjs --host desktop --level disable --edits 0 \
      --kit out/deck --deck out/deck/deck.md --probe tools/vscode-harness/probes/coda-parity.mjs --out vscode

## Results

| Run | Runs | Slides | Result |
|---|---|---|---|
| Runtime on (Disable): demo deck (bundle and kit), split widths (bundle and kit), main gallery, data-viz gallery, 52 component galleries | 58 | 801 | 58 pass. 53 key insights, 38 notes, 7 source lines, each equal to the engine's; every coda cell inside its slide |
| Strict: demo deck (bundle and kit), split widths (bundle and kit), main gallery, the split-compare, split-panel and video galleries | 8 | 201 | 8 pass. The notice draws; every beat's words are on the slide, as plain Markdown |
| Portrait split widths, runtime on and strict | 4 | 9 each | Fail, as expected on Marp: no slide splits, and on all 9 the coda cell sits below the slide's edge |
| Portrait split widths with no beats (control) | 1 | 9 | Every slide fits |

The demo deck also passed at `2aee2ef` itself, before this branch's engine fix, on both routes with the runtime on.

The table counts one passing run per deck and route. In the first batch, 13 of 69 runs returned no result at all: VS
Code re-created the preview frame while the harness read it, and puppeteer threw "detached Frame". That was a harness
bug, not a slide failure. After the fix in `tools/vscode-preview-probe.mjs` (`runtimeState`), all 13 were run again and
passed. No run that returned a result has failed.

## Screenshots

- `vscode-runtime-on-split-panel.png`: the demo deck's split-panel, runtime on. The key insight and the note close the
  supporting column.
- `vscode-panel-narrow-and-wide.png`: `split-panel panel-narrow` and `split-compare panel-wide`, runtime on.
- `vscode-strict-notice.png`: the same slide at VS Code's default (Strict): the kit's notice, and the slide as plain
  Markdown.
- `vscode-portrait-bare-vs-coda.png`: portrait, runtime on. Left, the slide without beats fits. Right, with beats: the
  key insight runs into the bottom edge, the note is gone, and the runtime's "Content clipped" pill shows.
- `engine-portrait-run-order-before-after.png`: the engine's portrait split-panel run, last page, light and dark. Left,
  before the fix: the note above the key insight. Right, after: the key insight, then the note.
