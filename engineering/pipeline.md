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
per slide, `<output>.NNN.png`). An HTML sidecar is always written alongside.
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
