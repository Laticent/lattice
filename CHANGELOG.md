# Changelog

All notable changes to Lattice are documented here. The project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) with one explicit
contract: **layouts and palette tokens are stable surfaces.** Breaking
changes to either are major version bumps. New layouts and new themes are
additive minor versions. Mermaid CSS overrides are internal and may change
in patch versions.

> ## Do not add entries to this file
>
> **A new entry goes in `changelog.d/<slug>.<category>.md` — one file per PR.**
> See `changelog.d/README.md`. Appending here is what ejected seven PRs from the
> merge queue in one evening (#1593); the release folds the fragments into
> `## Unreleased` and deletes them, so this file stays the frozen ledger.
>
> **This file still drives the release.** `## Unreleased` **plus every pending
> fragment** is the source of truth for the next version. `tools/changelog.js`
> reads the Keep-a-Changelog categories — a heading here, the filename there —
> to pick the bump deterministically, and the release rolls the assembled
> `## Unreleased` into a dated `## <version> - <date>` section:
>
> | Category (a `###` heading here, or a fragment's filename) | Bump |
> |---|---|
> | `### Removed`, or any `**Breaking:**` bullet / `BREAKING CHANGE` token | **major** |
> | `### Added`, `### Changed`, `### Deprecated` | **minor** |
> | `### Fixed`, `### Security` | **patch** |
>
> Write the entry **as the change lands** (see `CLAUDE.md` HARD RULE #10) — no
> entries anywhere means there is nothing to release. Flag a breaking change by
> leading the bullet with `**Breaking:**` so it counts as major even under
> `### Changed`.

> ## Everything before 1.0.0 is in `changelog/pre-release-archive.md`
>
> Lattice reached 1.0.0 with no prior release — no tag, nothing published — so
> what had accumulated under `## Unreleased` was a development log, not a version
> history. It is archived verbatim, along with the per-PR fragments still pending
> at the cut. **This file is the record of releases**, and `## Unreleased` below
> is the 1.0.0 announcement until 1.0.0 is cut.

> ## Cutting 1.0.0 needs `--bump major`, once
>
> `## Unreleased` below is grouped by CAPABILITY (`### Engine`, `### Theme`, …)
> rather than by Keep-a-Changelog category, because it is an announcement rather
> than a diff. `computeBump` recognizes no level in those headings, so the computed
> bump comes from whatever fragments happen to be pending — `patch` with none,
> `minor` today — and **it is never `major`**, so `auto` would ship `0.9.1` or
> `0.10.0` and step over 1.0.0 entirely. Cut the first release with an explicit
> level:
>
> ```
> npm run release -- --bump=major     # 0.9.0 → 1.0.0
> ```
>
> The `=` is required when invoking the script by hand — `tools/release.js` reads
> `--bump=<level>`, and the spaced form `--bump major` is parsed as the boolean
> `true` and rejected. Dispatching the `release` workflow needs no such care:
> choose `major` from its `bump` dropdown and it passes the `=` form through.
>
> This applies **only** to the 1.0.0 cut. From then on `## Unreleased` is written
> by the fragment assembler under real `### Added` / `### Fixed` headings, and
> `--bump auto` is correct again.

## Unreleased

_The 1.0.0 release. What Lattice is, at its first published version._

Lattice renders boardroom-quality decks from Markdown. A deck is plain text; the
engine owns typography, color, layout and export, so the author writes structure
and prose and never positions a box.

### Engine

- **One owned rendering engine behind every output.** The same transform kernel
  and stylesheet produce the PDF, the PowerPoint, the web page and the live
  preview, so a slide cannot look one way in the editor and another in the
  export. Marp remains only as an *export target* — a deck can be handed to a
  Marp toolchain — and no longer as a render path.
- **Six output formats from one command.** `lattice deck.md out.<ext>` writes
  **PDF**, **PPTX**, a self-contained **HTML** page with a built-in player, or an
  image set as **PNG**, **JPEG** or **WebP** (zipped, at a chosen scale). The
  format is chosen by the output extension; nothing else changes.
- **Seven named canvases.** `size:` selects `hd`, `4K`, `standard`, `square`,
  `portrait`, `story` or `mobile`, and the engine lays the deck out for the real
  canvas rather than scaling an HD render into it.
- **Rendering a deck twice produces byte-identical PDFs.** Timestamps and
  document IDs are pinned, so a rebuild that changed nothing diffs as nothing —
  which is what makes a committed PDF reviewable at all.
- **Speaker notes, deck logos, and slide corners are engine registers**, not
  per-theme CSS: they render identically on every surface that shows a slide.

### Components

- **61 components across 13 buckets** — anchor, statement, inventory, comparison,
  progression, evidence, imagery, chart, diagram, math, code, legal, connect.
  Each is a named slide shape with declared slots, capacity and anti-patterns,
  chosen with `<!-- _class: name -->`.
- **Every component documents itself.** A component ships its own `.docs.md`, a
  machine-readable manifest entry, and a gallery PDF in light and dark that
  renders every variant it supports — so the catalog is generated from the same
  source the engine renders.
- **A pick surface for agents and tooling.** `dist/docs/components.pick.md` is
  the whole catalog at one line per component (~3.8k tokens), for choosing a
  component without loading the 95k-token manifest.

### Theme

- **32 palettes**, each a set of role-named tokens rather than a color scheme.
  Layouts are palette-blind: every color goes through `var(--token)`, so a deck
  changes its entire look by changing one word.
- **Light and dark are one palette, not two themes.** A palette declares both
  canvases, and every layout works on either.
- **A palette's identity has one owner.** `themes/<name>.manifest.json` declares
  the name and the parent it extends; the filename, the `@theme` directive and
  the import graph are projections of it, and a gate fails if they disagree.
- **The engine owns the slide-size registry**, so a named canvas is defined once
  rather than duplicated across every palette.

### Accessibility

- **Contrast is enforced against rendered pixels, not asserted.** Text tokens
  carry a 4.5:1 AA floor and graphical tokens a 3:1 floor, measured on the
  surfaces they are actually painted on, across all 32 palettes in both color
  schemes.
- **Card boundaries are visible on every palette.** `--border` is curated to clear
  3:1 against both the canvas and the card fill in all 32 themes — 50 of 64
  palette-modes previously shipped an edge no contrast meter could find.
- **Five color-vision-deficiency palettes** — achromatopsia, deuteranopia,
  protanopia, tritanopia and a high-contrast base — each holding its separation
  on a dark canvas as well as a light one.
- **Categorical data carries texture as well as color**, so a chart or a legend
  stays readable when hue alone is not available.

### Diagrams and charts

- **Mermaid diagrams are themed from the palette.** Every Mermaid theme variable
  derives from the active palette's tokens, and diagrams clear WCAG's 3:1
  non-text floor in every palette and both schemes.
- **A whole deck's diagrams render in one invocation** rather than one per
  diagram.
- **`mode: sketch` draws the deck by hand** — rough.js strokes, hand-drawn faces,
  and a seed that makes the result reproducible rather than different on every
  render. It reaches charts, tables, frames and Mermaid labels alike.

### Authoring surfaces

- **The Studio** — a browser deck workspace with a live preview, an editor with
  inline lint, a component gallery, deck and workspace settings, and export.
- **The Playground** — the same engine on the docs site, for trying a deck
  without installing anything.
- **A deck linter with a shared core.** `lib/authoring/lint-core.js` is pure and
  filesystem-free, so the CLI, the Studio and the browser all apply the same
  rules to the same deck.

### Security

- **Untrusted decks reach a preview frame only through a sanitizer**, and both of
  the frame's channels are guarded: the markup and the stylesheet. A `</style>`
  carried in theme or author CSS ends the element in the HTML parser regardless
  of how well the markup beside it was sanitized, so the stylesheet channel is
  guarded wherever a document is assembled — the docs site and the CLI export
  path alike.
- **Directive values cannot inject CSS into a slide.** A front-matter value that
  smuggled a declaration into a slide's inline `style` could set arbitrary CSS,
  including a slide plane that erases the deck body.

### Examples and documentation

- **A gallery deck per component**, in light and dark, plus consolidated
  showcase galleries and per-feature demo decks under `examples/`.
- **A documentation site** covering the authoring contract, the component
  catalog, theming, the render pipeline and the engineering record.

### Position in SlideWright

Lattice is the engine layer of the [SlideWright](https://github.com/slidewright)
organization — the pipeline, the components, the theme system. The SlideWright
desktop application wraps this same engine for authors who would rather not work
in a terminal.
