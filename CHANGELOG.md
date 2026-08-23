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

> ## The pre-1.0.0 development log moved to `changelog/pre-release-archive.md`
>
> 1.0.0 shipped on 2026-08-09 from a hand-written section, without rolling `## Unreleased`
> into it — so that section kept growing until it was 18,382 lines and 99.7% of this file.
> It is archived verbatim (#1735). **The archive is repo-only**: `changelog/` is not in
> `package.json` `files`, so the npm tarball and the release zip carry this file alone.
>
> Those entries will not appear in the next release’s notes; that is the cost of the move,
> and it is deliberate. The VERSION is unaffected — the pending `changelog.d/` fragments
> still carry the `### Removed` entries and the `**Breaking:**` marker, so the computed
> bump is `major`, exactly as before.

## Unreleased

## 1.0.0

Initial public release.

### Engine

- Markdown-to-PDF renderer (`lattice-emulator.js`) with Marp-emulated HTML output,
  highlight.js syntax coloring, and per-diagram Mermaid pre-rendering.
- Browser runtime (`lattice-runtime.js`) for live Marp preview and web
  export contexts. Resolves the Mermaid theme from the loaded palette CSS
  at runtime.
- Single source of truth for color: every Mermaid theme variable derives
  from CSS custom properties in the active palette. The structural
  mapping (which Mermaid key gets which palette role) lives in `lattice-emulator.js`
  and does not change when palettes are swapped.

### Theme

- Two palettes: `indaco` (cool indigo, default) and `cuoio` (warm leather).
  Both extend `lattice.css` via `@import 'lattice'` and supply color tokens.
  Pale-cool / pale-warm designs with saturated brand borders and dark ink.
  Saturated red reserved for alarm states (gantt critical, error fills).
  Every other surface stays pale.
- Dark variant tokens (`section.dark` reskin) defined as part of the
  palette, so the same layouts work on either canvas.
- highlight.js syntax tokens defined as palette variables, so a theme
  can change syntax colors alongside slide colors.

### Layouts

- 25+ slide layouts including title, divider, content, diagram, two-column,
  card-grid, comparison, quote, timeline, list, full-bleed, big-number,
  split-panel, closing, finding, code-compare, image-half, stats,
  cards-stacked, criteria, verdict-grid, image-full, three-row, and dark
  variants.
- All layouts are palette-blind: every color reference goes through
  `var(--token)`, no hex literals.

### Mermaid

- Theme support for all 25 renderable Mermaid diagram types. ZenUML is
  documented as a non-renderable type in static-PDF contexts because the
  Mermaid CLI emits HTML/Tailwind classes without bundling the required
  stylesheet.
- Per-diagram CSS overrides for nine diagrams that ignore `themeVariables`
  or have hardcoded internal palettes (journey, mindmap, kanban, c4,
  radar, venn, ishikawa, treemap, plus a flowchart shape-coverage rule
  and a gantt outside-text fix).

### Examples

- `examples/gallery.md` and `gallery.pdf`: 40-slide layout gallery
  demonstrating every slide layout.
- `examples/mermaid-gallery.md` and `mermaid-gallery.pdf`: 31-slide
  diagram gallery covering all 25 Mermaid diagram types.

### Documentation

- `README.md`: project landing.
- `docs/skill.md`: deck authoring contract — layouts, directives, examples.
- `docs/theming.md`: how to author a palette, including the per-diagram
  Mermaid theming surface and parser limits.
- `docs/editorial.md`: prose rules for writing the words on the slides.
- `docs/architecture.md`: engine internals.

### Position in SlideWright

Lattice 1.0.0 is the first repository published under the
[SlideWright](https://github.com/slidewright) organization. Lattice is
the engine layer — the build pipeline, the layouts, the theme system.
The SlideWright desktop app (under development) will wrap this engine
with a GUI for non-developer deck authors.
