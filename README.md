<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/lattice-lockup-dark.svg">
    <img alt="Lattice" src="docs/public/lattice-lockup.svg" width="440">
  </picture>
</p>

# Lattice

A Markdown slide-deck engine for boardroom-quality decks — PDF, HTML, PPTX, or PNG sets.

Lattice produces decks where every slide is a deliberate component
(title, diagram, verdict-grid, and dozens more), all themed through a
single CSS palette and rendered to your delivery format with no manual
formatting work. Decks read as ink-on-paper and pass WCAG AA throughout.

You author every slide as plain Markdown — bullet lists, tables, fenced
code, `$…$` math — and Lattice renders it in the visual vocabulary your
field expects. Mathematicians and quants get KaTeX with
Definition/Theorem/Proof cards, derivation chains, and matrix
decompositions; project leads get gantt charts, kanban boards, and
roadmaps; engineers and architects get all 25 Mermaid diagram types and
side-by-side code diffs; lawyers and compliance get statute stacks,
authority chains, and obligation matrices; analysts get radar, quadrant,
and KPI components. More than fifty components, one syntax you already
know — no drawing tools, no boxes, no pasted screenshots.

Lattice is the engine at the heart of **Lattice Style** — a project born
from a refusal to keep fighting the slide tools we all use, one that
builds deck-quality documents with the discipline of a design system.
([Read the story](#why-lattice-style-exists).) The same Lattice engine that
runs from the command line will also run inside **SlideWright**, the desktop
app (under development), so a deck authored in either context renders
identically.

## Why Lattice Style exists

I built Lattice because the slide tools we all use make authors
unproductive by design — a blank canvas, no guardrails, and no way to see
what changed between two versions. Lattice is the fix I wanted: a deck as
a text file, where the design system's discipline and taste live in the
engine instead of being left to chance. The full story —
and what the name means — is at
[lattice.style/story](https://lattice.style/story/).

> **Documentation:** <https://slidewright.github.io/lattice/> — intro,
> getting started, authoring and theming guides, and the interactive
> [component reference](https://slidewright.github.io/lattice/components/)
> (every component, themable in any palette). Built from `docs/`; see
> [`docs/README.md`](docs/README.md).

## What you get

- **A renderer.** The bundled `lattice-emulator.js` emits PDF, PPTX, and PNG
  sets (plus an HTML sidecar) from the same source — the output extension picks
  the format, and PPTX/PNG rasterize from the same render as the PDF. Mermaid diagrams pre-render
  as inline SVG. Code blocks syntax-highlight. Slides are 1280×720.
- **Fourteen palettes.** `indaco` (cool indigo, the default) and `cuoio`
  (warm leather) are the canonical pair, alongside `ardesia`, `atelier`,
  `brina`, `burgundy`, `carbone`, `carta`, `concrete`, `crepuscolo`,
  `laguna`, `magnolia`, `mustard`, and `onyx` — most with a paired dark-canvas
  variant. Authors pick one in front matter (`theme: indaco`). Each
  supplies pale fills, saturated brand borders, and dark ink; saturated
  red is reserved for alarm states. WCAG AA verified across every
  text-bearing surface. Four additional **color-blind-safe** palettes
  (`a11y-deuteranopia`, `a11y-protanopia`, `a11y-tritanopia`,
  `a11y-achromatopsia`) re-tune the categorical hues for the common
  color-vision deficiencies and are selectable in the picker. Preview them all in the
  [component reference](https://slidewright.github.io/lattice/components/).
- **More than fifty components.** Title, divider, content, diagram, cards-grid,
  compare-prose, quote, timeline-list, big-number, split-panel, verdict-grid, more.
  Each component has an authoring contract documented in [design/skill.md](design/skill.md).
- **Mermaid integration.** All 25 renderable Mermaid diagram types are
  themed to match the deck. Per-diagram CSS overrides for the nine that
  ignore `themeVariables`. Documented in [design/theming.md](design/theming.md).

## Install

```sh
git clone https://github.com/slidewright/lattice.git
cd lattice
npm install
```

Requires Node 22+. `npm install` pulls in the Mermaid CLI and Puppeteer
(which downloads a matching Chromium). It does **not** pull Marp — the owned
engine renders every first-party path.

## Use as a package

Distributed as `@slidewright/lattice` (npm publishing is pending — see
[RELEASE.md](RELEASE.md)). The bundled `lattice` bin renders through the owned
engine — there is no Marp dependency or Marp render path:

```sh
npm install @slidewright/lattice

# The emulator, exposed as a bin (the owned engine). Resolves the engine +
# every theme relative to the installed package, so it works from any dir.
npx lattice deck.md deck.pdf
```

Need a portable bundle for someone who renders with Marp? The Drawing Board's
**Export to Marp** (and `npm run export:marp`) produces a self-contained `.zip`.
That bundle is the only Marp interop surface; Lattice itself never renders
through Marp.

The package also exposes these named entry points:

| Subpath | Resolves to | For |
|---|---|---|
| `@slidewright/lattice/default` | `dist/lattice-default.css` | **zero-config default** — engine + the cuoio palette, flattened into one drop-in stylesheet |
| `@slidewright/lattice/default/min` | `dist/lattice-default.min.css` | minified zero-config default — the leanest single-file `<link>` for browser use |
| `@slidewright/lattice/engine` | `lib/engine/index.js` | the **canonical render kernel** (`render()` + the transform pipeline) — for embedding the engine directly (HARD RULE #1: this is the source of truth all render paths share) |
| `@slidewright/lattice/runtime` | `dist/lattice-runtime.js` | the preview / web-export runtime transforms |
| `@slidewright/lattice/runtime/min` | `dist/lattice-runtime.min.js` | minified runtime — production / CDN drop-in (no inline source map) |
| `@slidewright/lattice/css` | `dist/lattice.css` | the engine bundle — **palette-blind** (components only, no color tokens) |
| `@slidewright/lattice/css/min` | `dist/lattice.min.css` | minified engine bundle (Marp `@theme`/`@size` directives preserved) |
| `@slidewright/lattice/themes/<name>.css` | `themes/<name>.css` | one palette — a **Marp theme file**, not a standalone stylesheet |
| `lattice` bin · `@slidewright/lattice` (`main`/`.`) | `dist/lattice-emulator.js` | the bundled CLI renderer / PDF exporter (`npx lattice deck.md out.pdf`) |
| `@slidewright/lattice/min` | `dist/lattice-emulator.min.js` | minified CLI bundle (shebang + executable bit preserved); the bin/main stays the unminified file |

The `.min` variants are byte-for-byte render-faithful to their unminified
siblings — the CSS minifier preserves Marp's directive comments, so a
minified bundle still registers as a theme. Pick the unminified files for
debugging (the CLI/runtime carry source maps; the CSS keeps comments) and
the `.min` files for production / CDN delivery.

**The default theme is cuoio** (warm leather/cream). In a Marp deck,
`theme: cuoio` selects it; with no theme chosen, decks render against the
engine's neutral built-in tokens. For a non-Marp / browser context, drop
in the flattened default — a single self-contained stylesheet:

```html
<link rel="stylesheet" href="…/@slidewright/lattice/default">  <!-- engine + cuoio -->
```

> **Per-theme files are Marp theme files, not drop-in CSS.** Each declares
> `@theme <name>` and pulls the engine in by name (`@import 'lattice'`),
> which only Marp's theme set resolves — a browser `<link>` to a *theme
> file* can't resolve it, and `dist/lattice.css` alone is palette-blind.
> The flattened `dist/lattice-default.css` is the exception: its
> `@import` is resolved at build time, so it is genuinely browser-droppable.
> Only cuoio is flattened today; other palettes would each be a new
> flatten target.

The published tarball ships only what these entry points need — engine
source, `dist/`, `themes/`, and the authoring docs. Regression-baseline
PDFs and per-bucket galleries stay in git but are excluded from the
package.

### Render to PDF, PPTX, or PNG

The bundled `lattice` bin (the emulator) emits all of them from one source —
the **output extension picks the format** — plus an HTML sidecar:

```sh
lattice deck.md deck.pdf     # vector PDF, selectable text
lattice deck.md deck.pptx    # PowerPoint, one full-bleed image per slide
lattice deck.md deck.png     # one PNG per slide → deck.001.png, deck.002.png, …
```

PPTX and PNG rasterize from the same headless-Chromium render as the PDF, so
every format is pixel-identical. Rendering needs Chromium — set `CHROME_PATH`
if no system Chrome is found.

> **PPTX note.** Slides export as one full-bleed *image* per slide (not editable
> text/shapes). Editable PPTX export (which needs LibreOffice) is not included.

Pass `--present` to mark the PDF to **open straight into full-screen
presentation mode** with a subtle cross-fade between slides:

```sh
lattice deck.md deck.pdf --present
```

Adobe Acrobat/Reader and most desktop viewers honor this (it's the same
document hint Keynote and PowerPoint emit); browser-embedded viewers and macOS
Preview ignore it harmlessly. Slides stay presenter-driven — no auto-advance.
A deck can also bake this in with a `present: true` front-matter key.

Pass `--fluid` (or `fluid: true`) to emit a **responsive, phone-readable HTML
viewer** instead of a fixed-box export — slides reflow to the viewport and you
swipe between them, so the same deck reads on a phone without pinch-zooming:

```sh
lattice deck.md deck.html --fluid
```

## Render the gallery deck

```sh
npx lattice test/integration/baseline-decks/gallery.md gallery.pdf
```

The gallery is committed to `test/integration/baseline-decks/` as the
ground-truth fixture for what the renderer produces (the docs site serves
the rendered PDF at
[/gallery.pdf](https://slidewright.github.io/lattice/gallery.pdf)).
Re-rendering it after an engine or palette change should produce visually
equivalent output; it's the regression check for the project.

For other delivery formats from the same source, just change the output
extension — the deck's `theme:` front matter selects the palette:

```sh
node lattice-emulator.js deck.md deck.pptx   # PowerPoint (image slides)
node lattice-emulator.js deck.md deck.png    # → deck.001.png, deck.002.png, …
```

PNG slides rasterize at 2× the slide dimensions (2560×1440 from 1280×720) —
sharp on retina displays and projectors. PDF is vector throughout (text,
SVG-rendered Mermaid, code highlighting); the 2× scale only affects the raster
(PNG/PPTX) paths.

The full pipeline (Mermaid pre-rendering, image conversion, PPTX
assembly) lives in [engineering/pipeline.md](engineering/pipeline.md).

## Use a different palette

Set `theme:` in your deck's front matter:

```yaml
---
theme: indaco   # cool indigo (default)
---
```

or

```yaml
---
theme: cuoio    # warm leather
---
```

For CLI builds, the active palette can also be overridden positionally:

```sh
node lattice-emulator.js deck.md out.pdf <palette-name>
```

The third positional argument names a file in `themes/`. The default is
`indaco`. To author a new palette, copy `themes/indaco.css`, change its
`@theme` directive to your name, and edit the tokens. See
[design/theming.md](design/theming.md) for the variable contract and the per-diagram
Mermaid override surface.

## Embed in a browser

For Marp live preview or web-export contexts, include `dist/lattice-runtime.js`:

```html
<link rel="stylesheet" href="themes/indaco.css">
<link rel="stylesheet" href="dist/lattice.css">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script src="dist/lattice-runtime.js"></script>
```

The runtime reads CSS custom properties from the loaded palette, derives
the Mermaid `themeVariables` object, and fetches the Mermaid CSS section
from the palette file. Same theme as the build path; one file to edit.

## Project layout

A count-free orientation — exact file lists and component/theme/gallery counts
drift, so they're not duplicated here. The canonical maps are generated or
indexed elsewhere; follow the pointers.

```text
lattice/
├── lattice-emulator.js   # the owned engine (CLI renderer; esbuild entry)
├── dist/                 # GENERATED, committed build artifacts — never hand-edit
│                         #   (lattice.css, the runtime/emulator bundles, docs/).
│                         #   Regenerate: npm run build · index: dist/README.md
├── lib/                  # engine source: core kernels, transformers, components/, theme/, forms/
├── themes/               # palettes (each light theme + a paired dark variant)
├── examples/             # the galleries + per-feature demo decks (+ committed PDFs)
├── docs/                 # the public documentation site (separate Astro package)
├── engineering/          # internal engineering references (+ decisions/ — design/ADR notes)
├── design/               # the design system + the deck-authoring contract
├── test/                 # unit/ (fast, no child procs) + integration/ (renders)
└── tools/                # build, lint, render, and audit scripts
```

- **Which doc covers what** → the "Read the canonical doc before working in its
  area" table in [`CLAUDE.md`](CLAUDE.md).
- **Every script/tool that exists** → [`engineering/capabilities.md`](engineering/capabilities.md)
  (generated from `package.json` + `tools/`).
- **The component/theme/token catalog** → `dist/docs/components.json` and
  [`design/design-system.md`](design/design-system.md).

## Testing

Two tiers, both built on Node's `node:test`:

```sh
npm test                  # unit tier — palette, var-map contract, source parse
npm run test:integration  # integration tier — rebuilds the galleries through
                          # lattice-emulator and the runtime; cross-renderer parity
npm run test:all          # both tiers
```

The unit tier finishes in under 100 ms and is the inner loop. The
integration tier takes ~30 s and is what CI runs before merge. The
top-level gallery (`test/integration/baseline-decks/gallery.md`) is the
authoritative test fixture; its committed PDF is the regression
baseline. Expected page counts are inlined in each test file; the 58
per-component galleries derive their counts from the manifest itself
via `expectedGallerySlideCount()`.

The integration suite asserts cross-renderer parity between the two
render paths — the owned engine (`lattice-emulator.js`) and the browser
runtime (`dist/lattice-runtime.js`).

## The Lattice Style project

Lattice is the engine at the core of **Lattice Style**, a project that
publishes tools for crafting deck-quality documents. The repositories
(current and planned, hosted at
[github.com/slidewright](https://github.com/slidewright) until the org
handle catches up to the name):

- **lattice** — this repo. The deck rendering engine + default palette.
- **SlideWright** — the desktop app (Tauri). Wraps the Lattice engine
  with a markdown editor, live preview, theme picker, and PDF export.
  Aims to make Lattice approachable for people who don't run `node`
  from a terminal. (Under development.)
- **themes** — additional palette packs that can drop into Lattice.
  (Future.)

## Versioning

Lattice follows semantic versioning with one explicit contract: **components
and palette tokens are stable.** A breaking change to either is a major
version bump. New components and new palettes are additive minor versions.
Mermaid CSS overrides are internal and may change in patch versions.
See [CHANGELOG.md](CHANGELOG.md) for the per-version detail.

## License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`). See [LICENSE](LICENSE).
Copyright © 2025–2026 SlideWright.

Lattice is free and open source, and everyday use carries no copyleft
obligations: rendering decks on your laptop or in CI is not distribution, and
the PDFs and PPTX files it produces are yours outright. The AGPL's conditions
attach to the engine itself — if you redistribute it, serve it to browsers
(shipping the JS/CSS bundles in a web app counts), or run a modified version
as a network service, your engine source must be available under the same
license. To embed Lattice in a closed-source product under different terms,
contact SlideWright about a commercial license.

Contributing requires a one-time signature of the
[Contributor License Agreement](CLA.md) — see [CONTRIBUTING.md](CONTRIBUTING.md).
Nothing was published to a package registry under MIT; the git history up to
the relicense commit remains MIT-licensed, and that grant is irrevocable for
that historical code.
