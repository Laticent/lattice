## Themes — palettes for Lattice

A **theme** is one CSS file that decides every colour on every slide.
Layouts (in `lattice.css`) are palette-blind: they only ever reference
`var(--token)`. A palette supplies the tokens. Swap palettes, every
colour changes; nothing about layout, spacing, or typography moves.

This directory ships ten palette pairs (`indaco`, `cuoio`, `atelier`,
`brina`, `burgundy`, `crepuscolo`, `laguna`, `magnolia`, `mustard`,
`onyx`) plus three structural extras (`ardesia`, `carbone`, `concrete`).
Each ships a `-dark` variant — a three-line wrapper that flips the
deck onto a dark canvas without touching colour values.

If you're here to author a new palette: skip to **The five-minute
path** below. The diagrams above it explain the model the engine has
of a palette, which is what makes the rules in the deep reference
(`design/theming.md`) make sense rather than feel arbitrary.

---

### The mental model in one picture

```
 your palette                  lattice.css                rendered slide
 ─────────────────             ─────────────────          ───────────────────
                            ╭─ var(--bg) ──────────────→  canvas background
 :root {                    │
   --bg: light-dark(…); ────┤   var(--accent) ──────────→  headings, links,
   --accent: …; ────────────┤                              eyebrow rules
   --cat-1-fill: …;  ─────────┤   var(--cat-1-fill) ────────→  pale categorical
   --cat-1-mark:  …;  ─────────┤                              fills (mermaid SVG,
   --diagram-stroke: …;  ─────────┤                              decision-list nth-
   --cat-on-fill: …; ───────┤                              child rotations,
   …                        │   var(--diagram-stroke) ────────→  every other layout
 }                          ╰                              the engine ships)
```

One channel leaves a palette file: **CSS variables**. Layouts and the
DIAGRAM OVERRIDES section in `lattice.css` both consume them via
`var(--token)`. The diagram overrides reach inline Mermaid SVG through
the host page cascade — the same mechanism the runtime preview uses —
so palettes never write per-diagram CSS or get handed to Mermaid's
`themeCSS` init parameter. (Earlier versions did; see
`engineering/decisions/2026-05-12-diagram-tokens.md` for why we dropped it.)

The engine reads the file once. Authors edit one file.

---

### Anatomy of the palette file

```
┌──────────────────────────────────────────────────────────────────┐
│ /* @theme <name> */         ← Marp registration, must match file                   │
│ @import 'lattice';          ← pulls in layouts + universal                         │
│                               semantic palette + structural vars                   │
│                                                                                    │
│ :where(:root){ color-scheme:light; }   ← zero-spec default                         │
│                                                                                    │
│ :root {                                                                            │
│   /* brand axis */          ─ 4-6 hex anchors, your single                         │
│     --brand-<hue>-deep        source of truth for the hue                          │
│                                                                                    │
│   /* surfaces & ink */      ─ light-dark(<light>, <dark>) pairs                    │
│     --bg, --bg-alt, --surface-inverse, --border                                    │
│     --text-heading, --text-body, --text-label, --text-muted                        │
│     --accent, --accent-soft, --on-accent                                           │
│                                                                                    │
│   /* semantic signals */    ─ --pass / --fail / --warn (+ -bg)                     │
│   /* seq ramp */            ─ --seq-500 anchor; derives 9 stops                    │
│   /* on-dark tints */       ─ derived from white via color-mix                     │
│   /* spectrum gradient */   ─ optional decorative ribbon                           │
│ }                                                                                  │
│                                                                                    │
│ :root {                                                                            │
│   /* dark-variant tokens */ ─ --scheme-dark-bg, --scheme-dark-text-* …             │
│ }                            consumed by light-dark() above                        │
│                                                                                    │
│ :root { /* hljs tokens */ } ─ code syntax colours                                  │
│ section .hljs-keyword { … } ─ + the rules that apply them                          │
│                                                                                    │
│ :root {                                                                            │
│   /* categorical palette */                                                        │
│     --cat-1-fill..--cat-12-fill ─ fills: light-dark(pale, jewel)                   │
│     --cat-1-mark ..--cat-12-mark  ─ marks: light-dark(deep, pale)                  │
│     --cat-on-fill  ─ label ink on the fill, FLIPS with tier                        │
│     --cat-on-mark  ─ ink on the mark, FLIPS with tier                              │
│                                                                                    │
│   /* structural */                                                                 │
│     --diagram-stroke              ─ universal saturated stroke                     │
│     --diagram-line                ─ edges, arrows (light-dark)                     │
│     --diagram-accent-warm         ─ secondary warm accent (radar etc.)             │
│                                                                                    │
│   /* optional universal-semantic overrides */                                      │
│     --diagram-active{,-mark}   ─ inherit lattice.css defaults if                   │
│     --diagram-done{,-mark}     omitted (most themes do); override                  │
│     --diagram-critical, --diagram-critical-mark only if you have curated values    │
│     --diagram-today, --diagram-note        (cuoio overrides for leather feel)      │
│ }                                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

`themes/indaco.css` is the canonical reference. Every other palette
follows this skeleton; the scaffolding command (below) stamps it for
you with TODO markers.

The DIAGRAM OVERRIDES section at the bottom of `lattice.css` consumes
the `--c-*` tokens via selectors against rendered Mermaid SVG. It's
palette-blind — declare the tokens and every diagram type picks them
up.

---

### The categorical contrast contract

Each categorical slot is a **flipping** pair of one hue: `--cat-N-fill` (the
leaf/area) and `--cat-N-mark` (the stroke/border) swap lightness tiers when the
canvas flips, and the paired inks flip with them. Status signals live in
`lattice.css` as universal defaults that themes can override:

```
   light mode           ┃ --cat-N-fill: pale chromatic   → --cat-on-fill: dark ink
   ⇅ canvas flips        ┃ --cat-N-mark: deep edge/border
   ─────────────────────╋──────────────────────────────────────────────────
   dark mode            ┃ --cat-N-fill: jewel tone       → --cat-on-fill: light ink
                        ┃ --cat-N-mark: pale tint
   ─────────────────────╋──────────────────────────────────────────────────
   three-layer contract ┃ ① mark vs --bg ≥ 3:1    ② fill vs --bg low (ungated)
   (checkCatContrast)   ┃ ③ --cat-on-fill vs fill ≥ 4.5:1    ④ fill ≠ mark
   ─────────────────────╋──────────────────────────────────────────────────
   universal semantic   ┃ --diagram-active(+-mark)   in-progress / warn pair
   palette (lattice.css ┃ --diagram-done(+-mark)     done / muted / grid pair
   defaults)            ┃ --diagram-critical(+-mark) saturated red, alarm pair
                        ┃ --diagram-today            saturated yellow highlight
                        ┃ --diagram-note             pale yellow aside surface
```

Slot 1 of the categorical cycle doubles as the canonical primary fill for any
single-band diagram (flowchart node, sequence actor). The 12 slots are
regenerated per theme by a deterministic recipe from each theme's own hues —
copy a shipped three-layer block (indaco / cuoio) and re-hue it.

`checkCatContrast` (in `tools/check-ownership.js`, via `build:check`) asserts the
three gated layers — ① mark-vs-`--bg`, ③ `--cat-on-fill`-vs-fill, ④ fill ≠ mark —
on every hue-based theme, both canvas modes. Layer ② is a design intention, not a
gated number.

---

### Dark mode in four lines

```
   author wants…                                     they write…
   ──────────────────────────────────────────────    ─────────────────────────
   whole deck dark, simplest                         theme: <name>-dark
   whole deck dark, with any palette                 style: ":root{color-scheme:dark}"
   follow viewer's OS preference                     style: ":root{color-scheme:light dark}"
   one slide dark on an otherwise-light deck         <!-- _class: dark -->
```

How: every surface token is declared as `light-dark(<light>, <dark>)`.
The browser resolves the function at every use site against the active
`color-scheme`. No engine plugins, no class-list surgery, no per-renderer
shims — the same mechanism works in marp-cli, the lattice emulator, and
the VS Code Marp preview.

The `--cat-on-fill` and `--cat-on-mark` inks **flip** with the scheme
(`--cat-on-fill: var(--text-heading)`), because the categorical fill swaps tiers
across canvas modes — pale in light, a jewel tone in dark — so the ink on top must
flip too (a fixed dark hex would drop below AA on the dark jewel fill and fail
`checkCatContrast`). The universal semantic palette (`--diagram-today`,
`--diagram-critical`, `--diagram-critical-mark`, `--diagram-note`) is the exception
that stays canvas-mode-independent by design.

---

### The five-minute path

```sh
# 1. stamp a starter palette from indaco
npm run new:theme verdigris

# 2. open the new file and edit the brand-axis hexes + cycle values
$EDITOR themes/verdigris.css

# 3. build a deck with it (-p selects the palette override)
node lattice-emulator.js examples/gallery.md /tmp/verdigris.pdf -p verdigris

# 4. verify diagrams render correctly
node lattice-emulator.js examples/mermaid-gallery.md /tmp/verdigris-mermaid.pdf -p verdigris
```

The scaffolder copies `themes/indaco.css`, rewrites the `@theme`
directive, and adds `TODO(palette):` markers on every value you're
expected to change. It also stamps the matching `<name>-dark.css`
wrapper so the dark variant works on day one.

What to change, in order of impact:

1. **Brand axis** (`--brand-<hue>-deep`, `--brand-<hue>-mid`,
   `--brand-<hue>`). These feed `--surface-inverse`, `--accent`, `--text-label`.
   Pick four shades along a single hue; everything else hangs off them.
2. **Accent** (`--accent`, `--on-accent`). The most-seen colour after
   ink. Must clear 4.5:1 against `--bg` and against `--accent-soft`.
3. **Categorical cycle** (`--cat-1-fill` / `--cat-1-mark` through
   `--cat-12-fill` / `--cat-12-mark`, plus the flipping `--cat-on-fill` and
   `--cat-on-mark` inks). Copy a shipped three-layer block (indaco / cuoio) and
   re-hue it — the tiers flip with the canvas, so keep the `light-dark()` pairs.
   The three-layer contract (mark-vs-`--bg` ≥ 3:1, `--cat-on-fill`-vs-fill ≥ 4.5:1,
   fill ≠ mark) is enforced in both modes by `checkCatContrast`.
4. **Structural tokens** (`--diagram-stroke`, `--diagram-line`, `--diagram-accent-warm`).
   The saturated brand stroke (reads on every pale fill including
   white), the edge/arrow line, and a secondary warm accent for
   radar's second curve and similar.
5. **Universal semantic palette** (`--diagram-active` / `--diagram-active-mark`
   / `--diagram-done` / `--diagram-done-mark` / `--diagram-critical` / `--diagram-critical-mark`
   / `--diagram-today` / `--diagram-note`). The deck's status-signaling colours.
   Inherit lattice.css defaults (cuoio is the one theme that overrides
   for its leather aesthetic).
6. **Dark variant tokens** (`--scheme-dark-*`). Used by `section.dark` and by
   the dark sides of every `light-dark(…)` pair.

You can ignore everything else on a first pass. The DIAGRAM OVERRIDES
section in `lattice.css` will work unchanged because every rule
references the `--c-*` tokens by name — your new values flow through.

---

### When something doesn't render right

```
   symptom                                    likely cause
   ────────────────────────────────────────   ───────────────────────────────
   Mermaid diagram renders Mermaid defaults   --c-* token missing from
   (gray boxes, no brand colour)              palette — DIAGRAM OVERRIDES
                                              rule falls through. Run
                                              test/unit/palette.test.js to
                                              catch missing tokens.

   Build-time "Palette missing CSS variable"  parsePaletteVars in
   warning + black gantt / sequence / error   lattice-emulator.js is reading
   fills in the rendered PDF                  the wrong CSS slice; check that
                                              it parses (layoutCSS + paletteCSS)
                                              so lattice.css's universal
                                              semantic palette is visible.

   Flowchart / sequence boxes "float" with    --diagram-stroke too pale — must be
   no visible border                          saturated to read on every pale
                                              fill including white

   Label unreadable on a categorical fill     --cat-on-fill pinned to a FIXED hex —
   in dark mode                               the fill is a jewel tone in dark
                                              mode, so the ink must FLIP to
                                              var(--text-heading)

   One slide is dark but the title shows      section.title pulls --scheme-dark-*
   wrong colours                              tokens directly; your dark
                                              variant block is incomplete
```

For deeper triage see `engineering/gotchas.md`.

---

### Where to go from here

| You want to…                                   | Read                       |
|------------------------------------------------|----------------------------|
| Author a new palette, end to end               | `design/theming.md`          |
| See the (retired) categorical proposal deck    | `themes/palette-audit.md` — chart-palette scoring only; its `--cat-*` values are superseded (#1022) |
| Understand why `themeCSS` was dropped          | `engineering/decisions/2026-05-12-diagram-tokens.md` |
| See every layout the engine ships              | `engineering/architecture.md`     |
| Trace a colour from palette to rendered pixel  | `lattice.css` (search the token, then the DIAGRAM OVERRIDES section) |
| Diagnose a render that "looks wrong"           | `engineering/gotchas.md` |
