# Skill — Create a theme

> Author a new palette (`themes/<name>.css`) that recolors every deck, holds WCAG
> AA everywhere text bears, and reads like ink on paper — not a rainbow.

**Read this when** you are asked to create a brand palette, a color scheme, or a
new theme. **You'll produce** two files: `themes/<name>.css` (the palette) and
`themes/<name>-dark.css` (a 3-line dark wrapper).

---

## The 10/10 bar

`lattice.css` is **palette-blind** — every layout references `var(--token)` and
never hardcodes a color. A theme is therefore *purely a token-declaration job*.
A 10/10 theme:

- **Sets every text token explicitly** — one ink on every light surface, no
  reliance on auto-inversion.
- **Holds two strict lightness tiers for fills**: pale fills at **L≈87** (read
  dark ink at 10:1+), deep marks/inks at **L≈32** (read white at 5:1+). This is
  what keeps charts and diagrams legible.
- **Reserves saturation for exactly two jobs**: one saturated brand stroke that
  reads on *every* pale fill including white (`--diagram-stroke`), and the alarm
  red (`--diagram-critical`). Every routine surface stays pale — the deck reads as
  ink on vellum.
- **Clears WCAG AA (4.5:1) for every text-bearing token in both light and dark.**
- **Curates key colors** rather than generating them: `--on-accent` is a single
  value tuned for AAA against *this* accent in both modes.

Mediocre looks like: raw hue soup with no tier discipline, pale strokes that let
boxes float, white-on-pale-accent collisions in dark mode, warn and fail that look
alike, generated categoricals that vanish on white.

---

## Mental model

A theme is one CSS file that declares **CSS custom properties (tokens) only** and
`@import 's lattice`. Two ideas do the heavy lifting:

1. **`light-dark()` pairs.** Every surface/ink/accent token is written as
   `light-dark(<light>, var(--scheme-dark-*))`. The browser resolves the function
   against the active `color-scheme`. That is why the **dark variant is 3 lines** —
   it just flips `color-scheme: dark` and every pair resolves to its dark side.
2. **Role names, never color names or tier suffixes.** Tokens are named for the
   *job* (`--text-heading`, `--accent`, `--cat-1-fill`, `--cat-1-mark`), never for
   a hue and never ending in `-light`/`-dark` (that suffix is retired — HARD
   RULE #11). Color-scheme lives only inside the `light-dark()` value.

---

## Where it lives

- **Files**: `themes/<name>.css` + `themes/<name>-dark.css`.
- **The engine token layer** you inherit from: `lib/base/base.tokens.css` (the one
  `*.tokens.css` file — the sanctioned home for `--token:#hex`).
- **The reference themes** to copy from: `themes/indaco.css` (cool default) and
  `themes/cuoio.css` (warm). The categorical proposals live in
  `themes/palette-audit.md`.
- **Commands**:
  - `npm run new:theme <name>` — copies `indaco.css`, rewrites `@theme`, stamps
    `TODO(palette):` on every author-edit value, and stamps the `<name>-dark.css`
    wrapper.
  - `node lattice-emulator.js test/integration/baseline-decks/gallery.md /tmp/x.pdf
    -p <name>` — render a broad component gallery in your palette (`-p`/`--palette`
    overrides the deck's `theme:`).
  - `node lattice-emulator.js examples/diagram-narration.md /tmp/x.pdf -p <name>` —
    verify Mermaid diagram colors.
  - `node tools/contrast-audit.js`, `node tools/cvd-audit.js` — contrast tooling.

---

## Recipe

1. **Scaffold**: `npm run new:theme <name>`. This gives you the light file (with
   `TODO(palette):` markers) and the dark wrapper.
2. **Edit in impact order** (each feeds the next):
   1. **Brand axis** — 2–6 hex anchors, the single source of the hue.
   2. **Surfaces** — `--bg`, `--bg-alt`, `--border`, as `light-dark()` pairs.
   3. **Ink ramp** — `--text-display / -heading / -body / -label / -secondary /
      -muted`. Every *content* tier clears AA; `--text-muted` is the one
      decoration-only, WCAG-exempt tier (chrome, glyphs) — never content text.
   4. **Accent** — `--accent`, `--accent-soft`, `--on-accent` (must clear contrast
      vs `--bg` **and** vs `--accent-soft`).
   5. **Categorical cycle** — copy the rank-1 brand-triad proposal from
      `themes/palette-audit.md`; you inherit the L≈87 / L≈32 tiers for free. Set
      the paired ink per the contract: `--cat-on-fill` a **fixed dark hex** and
      `--cat-on-mark` a **fixed white/cream** — both **non-flipping**, because the
      fills and marks hold their lightness tier in both canvas modes.
      **Caveat:** the shipped `indaco.css` currently deviates here (it sets
      `--cat-on-fill: var(--text-heading)` and a flipping `--cat-on-mark`) — follow
      the contract in `design/theming.md`, not those two lines, when you copy
      indaco.
   6. **Structural** — `--diagram-stroke` / `-line` / `-accent-warm`.
   7. **Dark-variant inputs** — the `--scheme-dark-*` block feeding the pairs.
   8. **Semantic signals** — `--pass` / `--warn` / `--fail` (keep warn clearly
      separated from fail).
3. **Annotate contrast ratios in comments** next to each ink token — house
   convention, and it forces you to check.
4. **Build & verify both canvases**: render the gallery and the mermaid gallery in
   light and dark. Register the palette name in `test/unit/palette/contrast.test.js`'s
   loop and in `.vscode/settings.json` under `markdown.marp.themes`.
5. Run `node --test test/unit/palette/*.test.js`.

---

## The contract / skeleton

A base palette's spine (from `themes/indaco.css`):

```css
/* @theme verdigris */          /* MUST match the filename */
@import 'lattice';              /* pulls in layouts + universal semantic palette */

:where(:root) { color-scheme: light; }   /* zero-specificity default so overrides win */

:root {
  /* Brand axis — the single source of the hue */
  --brand-canvas: #0B3A34; --brand-accent: #0E8C7A; --brand-bright: #17B89E;

  /* Surfaces — light-dark() pairs */
  --bg:     light-dark(#FBFDFC, var(--scheme-dark-bg));
  --bg-alt: light-dark(#EEF5F3, var(--scheme-dark-bg-alt));
  --border: light-dark(#CBDBD6, var(--scheme-dark-border));

  /* Ink ramp — every content tier clears AA (ratio in the comment) */
  --text-heading:   light-dark(#0A211D, var(--scheme-dark-text-heading));   /* 17:1 */
  --text-body:      light-dark(#1C2E2A, var(--scheme-dark-text-body));      /* 11:1 */
  --text-secondary: light-dark(#3A4E49, var(--scheme-dark-text-secondary)); /* AA   */
  --text-muted:     light-dark(#6B7B77, var(--scheme-dark-text-muted));     /* chrome only */

  /* Accent — clears contrast vs --bg AND vs --accent-soft */
  --accent:      light-dark(#0E8C7A, #17B89E);
  --accent-soft: light-dark(#D7ECE7, #123B34);
  --on-accent:   #FFFFFF;          /* curated for AAA on THIS accent, both modes */

  /* Categorical cycle — pale fills L≈87, deep marks L≈32 (copy from palette-audit) */
  --cat-1-fill: #DCEAE6; /* … 12 slots … */  --cat-1-mark: #0E5F53;
  --cat-on-fill: #10221E;          /* paired ink — a FIXED dark hex, non-flipping */
  --cat-on-mark: #FFFFFF;          /* paired ink — fixed white/cream, non-flipping */

  /* Structural — stroke MUST read on white */
  --diagram-stroke: #1F6E60; --diagram-line: light-dark(#0A211D, #EAF3F0);

  /* Semantic signals */
  --pass: light-dark(#2D6A3F, #4ADE80);
  --warn: light-dark(#B45309, #F97316);
  --fail: light-dark(#991B1B, #F87171);
}

:root { /* the --scheme-dark-* inputs consumed by the pairs above */
  --scheme-dark-bg: #0C1A17; --scheme-dark-bg-alt: #12241F; /* … */
}
```

The **required core tokens** (build fails without these, defined *directly*, not
inherited): `--bg`, `--bg-alt`, `--border`, `--text-heading`, `--text-body`,
`--text-secondary`, `--text-muted`, `--accent`, `--accent-soft`,
`--surface-inverse`.

The **dark variant in full** — this is the whole file:

```css
/* @theme verdigris-dark */
@import 'verdigris';
:root { color-scheme: dark; }
```

---

## What good looks like

- One explicit ink per surface; every text token set, none left to auto-inversion.
- `--diagram-stroke` a saturated brand hue that borders every pale fill including
  a white box — no floating boxes.
- `--cat-on-fill` / `--cat-on-mark` pinned to fixed hex so ink-on-fill stays legible
  in *both* canvas modes (the fills don't change tier when the scheme flips).
- `--warn` visibly distinct from `--fail` (amber vs red, not two reds).
- Contrast ratios annotated inline; the contrast test green in light and dark.

---

## What bad looks like

- `--cat-on-fill: light-dark(--text-heading, …)` — the fill stays pale in dark
  mode, so this makes white-on-pale. Pin it to a fixed dark hex.
- A pastel `--diagram-stroke` — boxes float with no readable border.
- `--text-muted` used for a subtitle or caption — it's WCAG-exempt; use
  `--text-secondary` for content.
- Inventing a `--fs-lg` or `--fs-xl` font-size token — the 12 `--fs-*` are closed
  (HARD RULE #4).
- A retired token name (`--c1-light`, `--c-stroke`, `--bg-dark`, `--dark-*`,
  `--scale-*`) or any name ending in `-light`/`-dark` (HARD RULE #11).
- Per-diagram CSS in the theme — Mermaid styling lives in `lattice.css`'s DIAGRAM
  OVERRIDES; a theme only declares the tokens.

---

## Ship checklist

- [ ] `@theme <name>` matches the filename exactly.
- [ ] All 10 required core tokens declared directly.
- [ ] Every surface/ink/accent token is a `light-dark()` pair; `--cat-on-*` and the
      universal semantic palette pinned to fixed hex.
- [ ] Fills at L≈87, marks at L≈32; `--diagram-stroke` reads on white.
- [ ] `<name>-dark.css` is the 3-line wrapper.
- [ ] Gallery + mermaid gallery rendered in light AND dark and looked at.
- [ ] Palette added to `test/unit/palette/contrast.test.js` and
      `.vscode/settings.json`; `node --test test/unit/palette/*.test.js` green.
- [ ] `npm run build:check` passes (no hex/typography/retired-name violations).

---

## Common mistakes

1. **Forgetting a required core token** → `theme "<name>" is missing N core token(s)`
   build failure.
2. **`light-dark()` on `--cat-on-fill`** → white-on-pale in dark mode.
3. **Pale stroke** → boxes float in diagrams.
4. **`--text-muted` for content** → drops below AA.
5. **Inventing an `--fs-*` token** (HARD RULE #4) or a **retired token name / a
   `-light`/`-dark` suffix** (HARD RULE #11).
6. **Lowering the contrast bar to pass the test** — lift the text or the surface
   instead; never lower the bar.
7. **A `--cat-N-mark` so saturated it kills mindmap text**, or so pale the diagram
   grays out.
8. **Skipping the accessibility path** — if the brand must ship a CVD-safe variant,
   base it on `a11y-base.css` (grayscale value ramp + status glyphs + textures);
   don't just recolor.

---

## Canonical sources

- `themes/README.md` — theme anatomy, declaration order, dark-variant mechanics.
- `design/theming.md` — the full variable contract, the Mermaid palette contract,
  the categorical cycle, the chart-family palette, CVD palettes.
- `engineering/typography.md` — the closed 12-token `--fs-*` system (HARD RULE #4).
- `lib/tokens/crosswalk.js` — the retired → canonical token-name map (HARD RULE
  #11).
- `lib/base/base.tokens.css` — the engine token defaults a theme inherits.
- `tools/check-ownership.js` — the gates (`checkHexLiterals`,
  `checkTypographyTokens`, `checkRetiredTokenNames`, `checkThemeTokenParity`).
