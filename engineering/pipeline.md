# Rendering pipeline — running PDF / PPTX / PNG / HTML

<!-- Output-format table below: keep in sync with `lattice-emulator.js` --help and
     the format switch (`OUT_FORMAT`). Cost figures come from
     engineering/decisions/2026-08-16-render-format-cost-assessment.md. -->

This is the operational how-to: the commands that turn a deck's Markdown into
shipped output. For the pipeline's internals (how the engine actually
transforms Markdown into HTML, why it works the way it does), read
[`architecture.md`](./architecture.md) § "The build pipeline" — this doc
doesn't repeat that, it tells you how to run it and what to do when it
misbehaves.

**One render path, one engine.** `dist/lattice-emulator.js` (built from
`lib/engine`) IS the renderer — there is no separate "when the real tool
isn't available, fall back to a hand-rolled one" path. If you're rendering a
Lattice deck, this is the tool, full stop.

## 1. Run it

```bash
node lattice-emulator.js <source.md> <output.pdf|.pptx|.png|.zip|.html> [palette]
```

The output extension picks the format — `.pdf` (vector, selectable text,
default), `.pptx` (one full-bleed slide image per slide), `.png` (one file
per slide, `<output>.NNN.png`), `.zip` (an **image set** — see §5), `.html`
(the rendered HTML *as* the deliverable, no PDF). For every format except
`.html`, an HTML sidecar is written alongside; with `.html` that sidecar **is**
the output file.

**Pick by cost, and it is not the ordering people expect.** Measured on a
58-slide deck (`2026-08-16-render-format-cost-assessment.md`):

| Output | Wall | Use it when |
|---|---:|---|
| `.html` | 6.77s | You want the HTML itself — `--player`/`--fluid` viewers, or anything reading markup or structure |
| `.pdf` | 8.24s | Sharing, review, goldens. **The cheapest artifact we commit** — 3–12× smaller than any image golden |
| `.pptx` / `.png` / `.zip` | 58–74s | You genuinely need pixels. ~860 ms/slide to rasterize |

The vector PDF is **not** the expensive option — every image format costs 7–9×
more and 3–12× more bytes. To review a PDF as images, rasterize it
(`tools/rasterize-for-review.sh`, §3) rather than re-rendering to `.png`:
render + `pdftoppm -r 30` is 15.5s against 59.0s.

**Pick `.html` because you want HTML, not because you want speed.** The saving
is proportional to how much PDF there is to encode: ~18% on the 58-slide gallery
and 20% on the chart gallery, but **under 1% on a one-slide fixture**, where
browser startup and `mmdc` dominate and the PDF is a few tens of milliseconds.

Its best use is with **`--player` / `--fluid`**: those build a viewer at the
`.html` path, and before `.html` was a real format they forced a full PDF encode
plus a megabyte-plus artifact nobody asked for. That win is real at any deck
size, unlike the percentage above.

`.html` is a **full browser render minus the PDF encode**, not a browser-free
path: auto-split and the overflow/legibility passes measure laid-out DOM, and
the written file is their post-split result — an `.html` render pages
identically to the same deck's `.pdf`. For markup with **no** layout (0.78s,
and no fonts/measurement/overflow/split), call `lib/engine` directly instead —
a different coverage tier, not a faster version of this one.
`node lattice-emulator.js --help` is the full reference (flags for speaker
notes, WebVTT captions, the fluid-box mobile viewer, the offline player, and
more — it's grown considerably past a bare PDF exporter).

Installed via npm, the same binary is `npx lattice`.

**Palette resolution** (highest wins): CLI positional/`--palette` flag →
`LATTICE_PALETTE` env → the deck's own front-matter `theme:` → default
`indaco`.

PNG/PPTX rasterize at 2× the slide dimensions (2560×1440 from 1280×720) —
sharp on retina displays and projectors. PDF stays vector throughout (text,
SVG-rendered Mermaid, code highlighting); the 2× scale only affects the
raster paths.

## 2. Mermaid diagrams

Handled automatically — no separate step. The engine resolves each
` ```mermaid ` block's theme variables from the active palette, renders it to
an inline SVG via `mmdc` (bundled), and substitutes the SVG for the fence
before layout runs. See `engineering/mermaid.md` for authoring Mermaid
blocks and the theming contract; this doc doesn't duplicate it.

## 3. Iterating during development

**`npm run preview` + `SendUserFile`** is the loop — never hand-roll a
Puppeteer/pdftoppm script for this. `npm run preview` auto-detects scope
from `git diff` (one deck vs. every deck using a touched component vs. the
whole gallery) and rebuilds only what changed; `SendUserFile` shares the
resulting PDFs/diff PNGs. Full loop + scope table: `engineering/workflow.md`
§ "Share — during dev, SendUserFile; at PR end, the raw URL".

`npm run preview:watch -- <deck>` runs a file watcher for a live desktop
loop. In VS Code, the Marp for VS Code preview pane is the fastest inner
loop for CSS/layout-only changes (no build step) — see `gotchas.md`'s
"Known preview gaps" register for what it does and doesn't cover relative
to the real render.

**Reviewing a rendered PDF in chat:** `tools/rasterize-for-review.sh <pdf>
[output-dir] [options]` rasterizes pages to PNG at review quality —
`--overview` for a whole-deck skim (auto-sized under the 2000px image
limit), `-f`/`-l` to bound a page range, `--region`/`--crop` to zoom a
specific area. Never downscale a rasterized slide yourself to fit an image
limit — low-DPI rasterization (what this script does) keeps vector edges
sharp at a smaller pixel count; naive downscaling blurs them. Full option
reference: run the script with no args, or read its header comment.

## 4. PPTX / PNG specifics

Both rasterize through the same screenshot path the PDF's `--raster` flag
uses — one full-bleed image per slide, selectable text is lost (PPTX has
always been image slides; `--raster` opts a PDF into the same trade for
maximum viewer compatibility). If a recipient needs an *editable* PPTX
(real text boxes, not an image), that's out of scope for this exporter —
Lattice's PPTX output is a presentation artifact, not an authoring one.

## 4a. CLI PDF output is byte-reproducible

Rendering the same deck twice **on the same machine** writes the same bytes — so
re-blessing a golden that did not visually change adds nothing to git, and `git
diff` on a committed PDF means the picture actually moved.

What made it churn was the wall clock: `/CreationDate` and `/ModDate` carried
the render time, and four differing bytes in 1.5 MB is a whole new blob as far
as git is concerned. Both fields are now pinned to the Unix epoch by
`lib/core/pdf-timestamps.js`, on every PDF path the **CLI** writes — vector,
`--raster`/`--paper`, and the `--notes` / `--present` / `--embed-source`
post-passes. The docs-site Studio's export is a different producer (jsPDF, in a
browser worker) and is **not** pinned; its output is a user download, never a
committed golden.

Set `SOURCE_DATE_EPOCH` (the [reproducible-builds][rb] convention) to stamp a
real date instead, and still get stable bytes:

```bash
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) node lattice-emulator.js deck.md out.pdf
```

[rb]: https://reproducible-builds.org/specs/source-date-epoch/

**This is same-machine reproducibility, and the cross-machine gap is much bigger
than people expect.** Skia's rasterization is CPU-dispatched and not
bit-identical across hosts, so a golden blessed on another machine still
differs — measured on one sandbox against the committed deck goldens, most sit
under 2% but **29 decks exceed 5%, one reaches 64%, and one re-paginates
entirely** (auto-split is height-driven, so it flips when font metrics shift).
That is why `tools/regression-gate.mjs` compares pixels with a tolerance rather
than bytes, and why it stays a local spot-check instead of a CI gate.

**Do not read a drift percentage as evidence of a regression** — reproduce it at
a commit predating the suspected cause first. The numbers, the controls, and how
that triage goes wrong are in
`engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md` §0a.

## 5. Image set (`.zip`)

A `.zip` output writes an **image set**: one raster per slide plus, by default,
small thumbnails and the deck's charts + Mermaid diagrams as standalone SVGs.

```bash
node lattice-emulator.js deck.md out.zip                              # perfect-fidelity PNG
node lattice-emulator.js deck.md out.zip --image-format webp --image-size 1x
```

The zip is one folder (`<deck>/`) holding `slides/`, `thumbnails/`, `assets/`
(the SVGs), and a `manifest.json` index. The default is lossless PNG at the
`max` size (2× HD, 1× for 4K — the same cap the PNG/PPTX paths use); flags trade
size for fidelity:

| Flag | Values (default first) | Effect |
|---|---|---|
| `--image-format` | `png` · `jpeg` · `webp` | Lossless PNG, or a lossy format for a smaller set (WebP smallest at equal quality). |
| `--image-size` | `max` · `2x` · `1x` · `half` | Raster scale — the "size selection" lever; lower shrinks each image and the whole zip. |
| `--image-quality` | `92` (1–100) | JPEG/WebP encoder quality; ignored for PNG. |
| `--image-mode` | `inherit` · `light` · `dark` · `print` | Color mode for the whole set. light/dark render the palette's light / dark variant; print is the B&W-safe handout. `inherit` (the default) = the deck's own / palette-resolved. |
| `--svg-background` | `inherit` · `light` · `dark` · `print` | The **look** of each standalone chart/diagram SVG — controls both its render and its canvas, *independent* of `--image-mode`. `light`/`dark` render the chart in that scheme; `print` renders it B&W-safe (grayscale + textures) on white — so you can export color slides but print-ready chart/diagram vectors. `inherit` (the default) follows the slides' color mode with no canvas. |
| `--thumb-width` | `480` (px) | Thumbnail width; height follows the slide aspect. |
| `--no-thumbnails` | — | Omit the `thumbnails/` folder. |
| `--no-svg` | — | Omit the `assets/` folder (the standalone chart/diagram SVGs). |

**How the SVG look is applied (a cross-surface nuance):** charts are token-driven, so both
surfaces recolor them fully for any look via an in-place restyle. Mermaid **diagrams** bake their
colors at render time (mmdc), so a CSS restyle can't recolor them — they need a re-render. Both
surfaces re-render for **any** cross-scheme look (light, dark, or print): the **Studio** re-renders
the whole deck in the look (a second render pass), and the **CLI** re-renders each diagram with the
**look palette's** theme vars and flattens it in an *isolated* page held in the look scheme (a clean
document — a page already rendered dark/color can't be faithfully retrofit to another scheme in
place, its rendered-scheme CSS leaks into the flatten). So a **dark-source deck → `light`** exports
dark-ink-on-light diagram vectors matching a native light render, **→ `dark`** exports a dark
diagram, and **→ `print`** exports print-ready black-on-white — the diagram look is now correct on
the CLI for every scheme, not just print. Charts recolor fully on both surfaces regardless.

The re-render is keyed on each diagram's **own bake scheme** (the deck's `color-mode:`), not the
palette-derived slide scheme — so a `color-mode: dark` deck exported to a `light` look re-renders
even when no `--image-mode` is set (the two can disagree). A diagram already in the look scheme keeps
its live markup (its context already matches).

Two caveats on the CLI diagram re-render: (1) it re-runs `mmdc` once per re-rendered diagram (a second
headless render), so a cross-scheme `--svg-background` on a diagram-heavy deck is noticeably slower
than a CSS-only look — expected, not a hang. (2) Two things a re-render can't fix, each **warned with a
count** (ungated by `--quiet`): a diagram that sets its **own** colors — an author `%%{init}%%` theme or
explicit `fill:`/`stroke:` in `style`/`classDef`/`linkStyle` — keeps them (the look can't override); and
a diagram whose `mmdc` re-render **fails** stays in the slide scheme and may read wrong on the look
canvas. The two are reported distinctly so an accidental render failure isn't mistaken for an intended
author color.

**The `manifest.json` index** (`kind: "lattice-image-set"`, `version: 2`) lets a
downstream tool wire up the set without probing files. It records: the deck `title`,
`palette`, `engine` version, and `createdAt`; the `format`/`colorMode`/`svgBackground`
(the RESOLVED scheme, not the raw `inherit`); `orientation` (landscape/portrait/square),
the `slide` (CSS px) and `pixel` (raster px) boxes, the `physical` size (inches, long edge
= 13.333in like the PPTX export) and the effective `dpi`; and per-file entries — each
slide's `title`, `image`/`thumbnail` paths and `bytes`, and each chart/diagram asset's
`kind`, `chartType`, and `bytes`. **The `dpi` is also baked into the PNG/JPEG bytes**
(a `pHYs` chunk / JFIF density) so the images drop into a print/office document at the
right physical size instead of the tool's 96dpi guess.

**One contract, two surfaces.** The zip layout, file naming, size presets, DPI, and
manifest live in one pure kernel (`lib/export/image-set.js`), so the CLI here and
the Studio's Share → **Images (.zip)** export emit the same set (HARD RULE #1).
For a **very large or 4K deck, prefer this CLI**: the Studio rasterizes in-tab and holds
every slide + thumbnail blob in browser memory at once, so a big deck can exhaust a
mobile/Safari tab — the CLI (Node, no per-tab ceiling) has no such limit.
The per-slide raster differs by surface (headless Chromium screenshots here;
`html-to-image` → `canvas` in the browser); the standalone SVGs reuse the
chart-SVG flatten kernel (`lib/components/chart/_chart-family/standalone-svg.js`,
the same one behind "download chart as SVG"), extended to Mermaid diagrams, with
fonts embedded so each `.svg` opens anywhere.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `render watchdog … wedged` / `Chrome disconnected` | Chrome's renderer crashed mid-render — the emulator fails fast (after one hardened retry with `--disable-gpu --disable-dev-shm-usage`) instead of hanging. Usually environmental; a fresh sandbox renders cleanly. Bump `LATTICE_RENDER_WATCHDOG_MS` (default 90000) only for genuinely huge decks on slow hardware. See `lib/engine/render-guard.js` (#502). |
| `error: unknown size: <name>` | The `size:` directive isn't a registered `@size` — the error lists the valid names. Fix the typo; the deck no longer renders silently at the wrong geometry (#502). |
| "no browser" / Puppeteer launch failure | `CHROME_PATH` isn't set or points at a missing binary. The cloud sandbox's SessionStart hook exports it automatically — if you see this, re-export it (see `engineering/development.md` § "Cloud sandbox"). |
| PDF renders but images/Mermaid are missing | Almost always a stale `dist/` — `npm run build` regenerates every artifact; HARD RULE #2 bars hand-editing `dist/` directly. |
| PPTX text isn't selectable/editable | By design — PPTX export is image-per-slide (`lib/export/pptx-export.js`), matching Marp's own default PPTX and needing no external `soffice`/LibreOffice. An editable-text variant isn't implemented; don't work around it in Markdown. |

For anything not covered here, check `engineering/gotchas.md` first (the
living symptom index) before assuming it's a new bug.
