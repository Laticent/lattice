# Lattice Slide Deck Pipeline — Skill

## What This Skill Covers

Instructions for creating, rendering, and auditing Lattice presentation decks. Lattice Markdown is the single source of truth; output formats are PDF, HTML, PPTX, and PNG sets.

**`lattice.css` is the source of truth for visual output.** All rendering modes must produce output faithful to the CSS spec. When output deviates, the CSS wins — not the renderer.

---

## Load the Right Reference

Open the relevant file before starting work. Only load what the current task needs.

| Task | Load |
|------|------|
| **Understanding the catalog** — function families, forms, substances, the component model | [design-system.md](./design-system.md) — the canonical four-layer model |
| Writing or editing slide content | [design.md](./design-principles.md) + `lib/components/<name>/<name>.docs.md` per component |
| **Picking a component** by purpose (the *what kind of slide*) | [design-system.md §3](./design-system.md#3-the-7-functions) — function families table |
| **Cross-cutting authoring patterns** (eyebrow, subtitle, key-insight, state markers, dark/mirror/numbered, etc.) | [../lib/base/base.docs.md](../lib/base/base.docs.md) |
| Scaffolding a new slide from a known component | `npm run new:slide <component>` (skeleton via the manifest); `npm run new:slide -- --list` enumerates the 53 shipped components |
| Adding a treatment — tint or mark (`tint-*` / `mark-*` classes, `at-*` placement) | [treatments.md](../engineering/treatments.md) |
| Adding a Mermaid diagram | [mermaid.md](../engineering/mermaid.md) |
| Running the render pipeline (PDF/HTML/PPTX) | [pipeline.md](../engineering/pipeline.md) |
| Verifying render correctness (semantic-invariant suite, visual review) | [visual-review.md](../engineering/visual-review.md) |
| Hitting an unexpected behavior, hack, or browser/Marp/Mermaid quirk | [gotchas.md](../engineering/gotchas.md) — read first when something breaks in an unfamiliar way; add an entry when you find a new one |

**Do not load all files at once.** Load only what the task requires.

**Vocabulary.** A **component** is what authors invoke as `<!-- _class: cards-grid -->`. The pre-design-system docs called these "layouts" or "templates" — the words are interchangeable in older prose, but design-system.md normalises on *component*.

---

## Rendering Modes (quick reference)

Three modes, same `.md` source file — no source changes needed.

| Situation | Use |
|-----------|-----|
| Final PDF / PPTX / PNG for delivery | Mode 3 — the `lattice` CLI (owned engine; **default**) |
| VS Code live preview | Mode 1 — Marp Extension (marp-vscode) |
| Verifying layout spec compliance | Mode 3 (the owned engine is canonical) |

**Default to the bundled `lattice` CLI (Mode 3)** — the owned engine renders
every first-party path and needs no Marp.

**Image quality.** PDF and HTML are vector end-to-end (text, SVG-rendered Mermaid,
code highlighting) — no DPI knob to turn. PNG export rasterizes through Chromium;
the `lattice` CLI emits 3840×2160 PNGs (3× the 1280×720 slide) by default.

**Mode 3 — the `lattice` CLI (`lattice-emulator.js`, the default):** the owned
engine — no marp needed. `lattice.css` is auto-resolved; the deck's `theme:` front
matter selects the palette; the OUTPUT EXTENSION picks the format.
```bash
node lattice-emulator.js examples/gallery-jargon.md output.pdf
# vector PDF (+ HTML sidecar); bundled lattice.css; palette from front matter
node lattice-emulator.js examples/gallery-jargon.md output.pptx
# PowerPoint (one full-bleed image per slide)
node lattice-emulator.js examples/gallery-jargon.md output.png
# one PNG per slide → output.001.png, output.002.png, … (2× = 2560×1440)
node lattice-emulator.js examples/gallery-jargon.md output.pdf cuoio
# explicit palette override (CLI arg has highest precedence)
node lattice-emulator.js -o output.pdf -p cuoio examples/gallery-jargon.md
# named flags: -o/--output, -p/--palette, -c/--css, -q/--quiet (positional still works)
```

Palette resolution precedence: CLI flag > positional palette > `LATTICE_PALETTE` env > deck front matter `theme:` > default `indaco`. Run `node lattice-emulator.js --help` for the full reference. Exit codes: `0` success, `1` usage/file/render error.

The 2nd positional accepts either an output path or a `.css` path; if it ends in `.css` the emulator treats it as a custom layout CSS and shifts the remaining args right (backward-compat with the old 3-arg form).

Full rendering pipeline (Mermaid, PPTX, image conversion): see [pipeline.md](../engineering/pipeline.md).

---

## Dark canvas (quick reference)

Lattice renders dark canvas via the native CSS `color-scheme` cascade —
no class-list surgery, no per-renderer logic. Same recipe in the engine,
the emulator, and the VS Code preview.

| Goal | Front-matter |
|---|---|
| Whole deck dark (or light) | `color-mode: dark` (or `color-mode: light`) |
| Follow the viewer's OS preference | `color-mode: system` |
| Adopt the host (site toggle / reader's OS) | `color-mode: inherited` |
| Whole deck dark, simplest theme swap | `theme: cuoio-dark` (or `indaco-dark`) |
| One slide dark on a light deck | `<!-- _class: dark -->` on that slide |

The first-class `color-mode:` key is the recommended way (the legacy `class: dark`/
`class: light` still works but is deprecated). Default is light. Layout classes that always want a dark canvas
(`section.title`, `section.divider`, `section.closing`) keep their dark
chrome regardless of the deck's color-scheme.

For the architectural detail (why `light-dark()` + `:where(:root)`),
see [theming.md § Dark mode](./theming.md#dark-mode).

---

## Custom logo (quick reference)

Discreet top-right brand mark; the img is desaturated to a faint
grayscale watermark via CSS `filter`, with brightness inverted on
dark-canvas layouts so the mark adapts without per-author variants.
Works on SVG, PNG, and JPEG. Composes with every treatment
(`tint-*` or `mark-*`).

| Goal | Front-matter |
|---|---|
| Logo on every slide | `logo: ./logo.svg` |
| Title slide only | `logo: ./logo.svg` + `logo-on: title` |
| Preserve brand colours on a plate | `logo: ./logo.svg` + `logo-style: brand` |

The directive runs at build time. It does **not** render in the
marp-vscode preview pane, which runs marp-core directly without Lattice's
markdown-it plugins. The published-HTML path
(`lattice-runtime.js`) restores it for any deck served from a web
origin. See [lib/base/base.docs.md § Custom logo](../lib/base/base.docs.md)
and [gotchas.md](../engineering/gotchas.md).

---

## Visual testing — pick the right path

Five paths can produce a slide screenshot or rebuilt PDF. They have meaningfully different costs; choose by what's changing and how many slides.

| Need                                                | Path                                              | 1 slide (cold) | 4 slides (amortized) | Resolution  |
| --------------------------------------------------- | ------------------------------------------------- | -------------: | -------------------: | ----------- |
| **Fast author loop on a deck or component** (default during development) | `npm run preview` (auto-scope from `git diff`) or `npm run preview:watch -- <deck>` for live rebuild | ~2s/deck | scope-detected | PDF (vector) |
| Inspect **committed baseline** (CSS unchanged)      | `pdftoppm` on `examples/gallery.pdf`              |          0.3s  |              0.1s/slide | 4000×2250   |
| **Single slide, fastest** (PNG)                     | `lattice-emulator` → `screenshot-slides.js`       |          1.6s  |              0.5s/slide | configurable (use scale 3 → 3840×2160) |
| **Multi-slide** (one PNG per slide)                 | `lattice-emulator` → `rasterize-for-review.sh --overview` |   2.4s  |              0.7s/slide | 300dpi      |
| Iterative loop on prebuilt HTML                     | `screenshot-slides.js` against existing HTML      |          1.6s  |              0.5s/slide | configurable |
| Cross-renderer regression                           | `npm run test:integration`                        |             —  |                  ~30s | full check  |

**`npm run preview` is the primary visual loop during development.** It reads `git diff` and only rebuilds the decks affected by the change (L0 nothing → L3 full). PNG screenshot paths below are for spot-checks and screenshot capture, not the everyday "did this change break anything" loop. See [workflow.md § Iteration cycle](../engineering/workflow.md#iteration-cycle) for the L0–L3 scope taxonomy and the `SendUserFile`-based share contract.

**Picking the path.**

- **No CSS changes? Just inspecting what's shipped?** → `pdftoppm` on the committed gallery PDF. ~10× faster than any render path because no browser is involved.
- **Single-slide spot check on current CSS?** → `lattice-emulator` to produce HTML, then `screenshot-slides.js` against that HTML. Skips loading a prebuilt HTML — fastest for one slide.
- **Multi-slide preview?** → render with `lattice-emulator` then `tools/rasterize-for-review.sh <pdf> --overview` (one PNG per slide). Per-slide cost amortizes well across a deck.
- **Iterative inner loop (changing the deck or screenshotting different slides repeatedly)?** → Build HTML once with `lattice-emulator`, then loop `screenshot-slides.js [html] [out] <idx> 3`. Each screenshot is ~1.6s with no re-render.
- **Suspect renderer drift?** → `npm run test:integration` rebuilds both galleries through both renderers and asserts page counts.

**Identifying which slide.** Don't count `---` separators in source — that's fragile during authoring (code fences containing `---`, WIP decks with stray rules, `headingDivider` mode). The reliable way is to identify slides by their *content*. `tools/screenshot-slides.js` accepts a content selector as its 3rd positional arg or `--selector EXPR`:

| Selector form        | Matches                                              |
| -------------------- | ---------------------------------------------------- |
| `all`                | every slide (default)                                |
| `<integer>`          | 1-based index (e.g. `47`)                            |
| `h2:<substring>`     | first slide whose first `<h2>` contains substring    |
| `class:<substring>`  | first slide whose `<section class="…">` contains substring |
| `footer:<substring>` | first slide whose `<footer>` contains substring     |
| `match:<substring>`  | first slide matching any of the above               |

Substring match is case-insensitive; first hit wins. When a selector matches zero slides the tool prints the first 10 H2 titles to help you correct the term.

The emulator's source splitter is fence-aware — `---` lines inside fenced code blocks (` ``` ` or `~~~`) are *not* treated as slide breaks, and `headingDivider: N` from front matter splits on h1..hN as Marp does. Rendered HTML therefore reliably has one `<section>` per intended slide, which is what the selector logic above walks.

**Recipes.**

```bash
# 1. Inspect the committed baseline (no render — fastest)
mkdir -p .scratch/peek
pdftoppm -png -r 300 -f 47 -l 47 examples/gallery.pdf .scratch/peek/slide

# 2. Single slide on current CSS, by H2 substring (no slide-counting)
mkdir -p .scratch/peek
node lattice-emulator.js deck.md .scratch/peek/deck.pdf
#  lattice.css auto-resolved · palette from front matter (no CLI args needed) ↑
node tools/screenshot-slides.js .scratch/peek/deck.html .scratch/peek h2:banner-tag 3
#                                                                    │             │
#                                                content selector ───┘             └─ deviceScaleFactor (3 = retina)

# 3. Multi-slide, single-step (owned engine → one PNG per slide)
mkdir -p .scratch/peek
node lattice-emulator.js deck.md .scratch/peek/deck.pdf
tools/rasterize-for-review.sh .scratch/peek/deck.pdf --overview
# Front matter `theme:` selects the palette. Outputs are .scratch/peek/p-NN.png.
```

`screenshot-slides.js` 4th arg is `scale` — defaults to **3** (retina/projection-quality 3840×2160, matching the `lattice` CLI's 3× export). Pass `1` for fast smoke-tests where pixel quality doesn't matter. Run `node tools/screenshot-slides.js --help` for all options. Exit codes: `0` success, `1` HTML missing or selector matched no slide, `2` selector syntax error. Named-flag form: `--html PATH --out DIR --selector EXPR --scale N --quiet` — positional still works.

Numbers benchmarked on this repo with a 4-slide preview deck. Cold-start dominates single-slide cost; per-slide cost on larger decks amortizes the Chromium launch. Loading a large HTML (e.g. the 74-page gallery) into Puppeteer adds ~1s of DOM-parse time on top of Chromium cold-start, even when only one slide is screenshotted — so for repeated single-slide work against the same HTML, a future `--watch` mode that keeps the page hot would drop subsequent screenshots to ~200ms.

---

