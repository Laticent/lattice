# Rendering pipeline — running PDF / PPTX / PNG / HTML

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
node lattice-emulator.js <source.md> <output.pdf|.pptx|.png|.html> [palette]
```

The output extension picks the format — `.pdf` (vector, selectable text,
default), `.pptx` (one full-bleed slide image per slide), `.png` (one file
per slide, `<output>.NNN.png`), `.zip` (an **image set** — see §5). An HTML
sidecar is always written alongside.
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
| `--image-mode` | `auto` · `light` · `dark` · `print` | Color mode for the whole set. light/dark render the palette's light / dark variant; print is the B&W-safe handout. `auto` = the deck's own / palette-resolved. |
| `--svg-background` | `inherit` · `light` · `dark` · `print` | The **look** of each standalone chart/diagram SVG — controls both its render and its canvas, *independent* of `--image-mode`. `light`/`dark` render the chart in that scheme; `print` renders it B&W-safe (grayscale + textures) on white — so you can export color slides but print-ready chart/diagram vectors. `inherit` (the default) follows the slides' color mode with no canvas. |

**How the look is applied (a cross-surface nuance):** charts are token-driven, so both
surfaces recolor them fully for any look. Mermaid **diagrams** bake their colors at render
time. The **Studio** re-renders the deck in the look (a second render pass), so diagrams are
fully re-colored. The **CLI** re-styles in place — correct for the common case (a light/color
deck → any look reads on white, since light-baked diagram text is dark) — but a *cross-scheme*
diagram look (e.g. a **dark-source** deck → `print`/`light`) keeps the baked Mermaid text/edges
in the slide scheme. For guaranteed diagram re-coloring from a dark-source deck, use the Studio,
or export the whole set in that `--image-mode`.
| `--thumb-width` | `480` (px) | Thumbnail width; height follows the slide aspect. |
| `--no-thumbnails` | — | Omit the `thumbnails/` folder. |
| `--no-svg` | — | Omit the `assets/` folder (the standalone chart/diagram SVGs). |

**One contract, two surfaces.** The zip layout, file naming, size presets, and
manifest live in one pure kernel (`lib/export/image-set.js`), so the CLI here and
the Studio's Share → **Images (.zip)** export emit the same set (HARD RULE #1).
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
