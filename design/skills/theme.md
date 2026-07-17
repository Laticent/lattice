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
- **Holds the categorical three-layer contrast contract** on every `--cat-N`
  slot, in both canvases: ① the **mark** (edge/border) reads against the canvas
  (`--cat-N-mark` vs `--bg` ≥ 3:1, WCAG 1.4.11 graphical); ② the **fill** is
  *intentionally* low-contrast against the canvas — the ① border delineates it;
  ③ the **label ink** reads on the fill (`--cat-on-fill` vs `--cat-N-fill` ≥
  4.5:1, WCAG AA); and fill and mark are **distinct tiers of one hue** — never
  equal (equal fill/mark is the collapse bug the gate was built to catch).
  `checkCatContrast` gates **three of these** — ① mark-vs-bg, ③ ink-vs-fill, and
  the anti-collapse floor — over every hue-based theme, both modes. Layer ② is a
  *design intention* the ① border makes safe, not a machine-checked number.
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
  `themes/cuoio.css` (warm) — their `--cat-*` **values** are the current three-layer
  cycle, so copy them freely.
- **⚠️ Two stale neighbors — trust this skill's model over them.** `indaco.css`'s own
  header comment and the `TODO(palette)` checklist the scaffold stamps still describe
  the *retired* "L≈83/L≈60 band" model, the fixed-non-flipping ink, and retired token
  names (`--diagram-band-*`, `--cat-blue`, `--chart-1..6`, `--dark-*`). The token
  **values** they carry are correct; their **explanatory prose** is not — follow the
  three-layer recipe below, not those comments. `themes/palette-audit.md` scored its
  categorical proposals under the retired model — **do not copy its `--cat-*` values**;
  it stays valid only for the separate chart palette.
- **Commands**:
  - `npm run new:theme <name>` — copies `indaco.css` (a correct three-layer block),
    rewrites `@theme`, stamps a `TODO(palette):` checklist (see the warning above about
    its stale prose), and stamps the `<name>-dark.css` wrapper.
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
   5. **Categorical cycle** — the scaffold copies indaco's block verbatim, so you
      **start from a correct three-layer cycle** and only re-hue it. Each slot is a
      *flipping* pair of the SAME hue: `--cat-N-fill: light-dark(<pale chromatic>,
      <jewel tone>)` and `--cat-N-mark: light-dark(<deep edge>, <pale tint>)` — fill
      and mark are opposite tiers, and they swap tiers when the canvas flips.
      **Because the fill goes pale→jewel across modes, the inks must flip too:**
      `--cat-on-fill: var(--text-heading)` (dark ink on the pale light fill, light
      ink on the jewel dark fill) and `--cat-on-mark: light-dark(#FFF, <dark>)`. The
      three layers these satisfy — mark-vs-canvas ≥ 3:1, label-ink-vs-fill ≥ 4.5:1,
      fill ≠ mark — are measured in **both** modes by `checkCatContrast`. *(This is
      the #1022 recolor. The old "pale L≈87 / deep L≈32, fixed non-flipping ink"
      recipe is retired: a fixed dark `--cat-on-fill` now FAILS the gate in dark
      mode, where the fill is a jewel tone and dark-on-dark drops below AA.)*
      **Optional — texture adoption.** A monochrome (onyx) or CVD-safe theme that
      can't separate categories by hue declares **12** `--cat-N-texture:
      url(#latt-<set>-N)` tokens (onyx → `latt-onyx-tex`, concrete →
      `latt-concrete-tex`); every categorical diagram then fills with a repeating
      pattern instead of flat color. Undeclared = flat color, byte-identical for a
      hue-based theme. This is the universal channel from
      `engineering/textures.md` — declare the 12 tokens, nothing else.
   6. **Structural** — `--diagram-stroke` / `-line` / `-accent-warm`.
   7. **Dark-variant inputs** — the `--scheme-dark-*` block feeding the pairs.
   8. **Semantic signals** — `--pass` / `--warn` / `--fail` (keep warn clearly
      separated from fail).
3. **Annotate contrast ratios in comments** next to each ink token — house
   convention, and it forces you to check.
4. **Build & verify both canvases**: render the baseline gallery and a Mermaid deck
   in light and dark. Register the palette name in **`test/unit/palette/token-parity.test.js`'s
   `THEMES` array** (this is what enforces the full 91-token contract on your theme)
   and in `.vscode/settings.json` under `markdown.marp.themes`. (`contrast.test.js`
   is hardcoded to `['indaco','cuoio']` by design — sibling palettes ride the indaco
   run via cascade — so adding your theme *there* does nothing.)
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
  --bg:              light-dark(#FBFDFC, var(--scheme-dark-bg));
  --bg-alt:          light-dark(#EEF5F3, var(--scheme-dark-bg-alt));
  --border:          light-dark(#CBDBD6, var(--scheme-dark-border));
  --surface-inverse: light-dark(#0A211D, #EAF3F0);   /* required core token */

  /* Ink ramp — every content tier clears AA (ratio in the comment) */
  --text-heading:   light-dark(#0A211D, var(--scheme-dark-text-heading));   /* 17:1 */
  --text-body:      light-dark(#1C2E2A, var(--scheme-dark-text-body));      /* 11:1 */
  --text-secondary: light-dark(#3A4E49, var(--scheme-dark-text-secondary)); /* AA   */
  --text-muted:     light-dark(#6B7B77, var(--scheme-dark-text-muted));     /* chrome only */

  /* Accent — clears contrast vs --bg AND vs --accent-soft */
  --accent:      light-dark(#0E8C7A, #17B89E);
  --accent-soft: light-dark(#D7ECE7, #123B34);
  --on-accent:   #FFFFFF;          /* curated for AAA on THIS accent, both modes */

  /* Categorical cycle — flipping tiers of ONE hue; three-layer contrast (checkCatContrast) */
  --cat-1-fill: light-dark(#BCD5EC, #006398);  /* pale light ↔ jewel dark · … 12 slots … */
  --cat-1-mark: light-dark(#2E608A, #D4DFE8);  /* deep light ↔ pale dark — the border */
  --cat-on-fill: var(--text-heading);          /* label ink — FLIPS with the fill tier */
  --cat-on-mark: light-dark(#FFFFFF, #0A1628); /* ink on the mark — also flips */
  /* Optional (monochrome/CVD themes): 12 --cat-N-texture: url(#latt-onyx-tex-1) … tokens */

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

The **10 required core tokens** — `build:check` fails without these, defined
*directly*, not inherited: `--bg`, `--bg-alt`, `--border`, `--text-heading`,
`--text-body`, `--text-secondary`, `--text-muted`, `--accent`, `--accent-soft`,
`--surface-inverse`.

But those 10 are the floor, not the contract. A **from-scratch theme must define
the full 91-token per-theme contract directly** (the `CONTRACT` list in
`test/unit/palette/token-parity.test.js`) or the untuned tokens fall back to
indaco's cascade values and your deck renders code, diagrams, and categoricals in
*indaco's* colors — a mediocre "indaco in disguise" that still lints clean. Beyond
the 10 core tokens, define: all 12 `--hljs-*` code-syntax colors; **all 12**
`--cat-N-fill` / `--cat-N-mark` pairs (the skeleton shows only cat-1); `--text-display`,
`--text-label`, `--code-text`; `--pass-bg` / `--fail-bg` / `--warn-bg`; the
`--scheme-dark-*` block; the `--diagram-*` semantic palette; `--c-container` /
`--c-subcontainer`; and the `--chart-cat1..8` / `--chart-state-*` chart palette.
**Note:** `token-parity` only checks the themes *listed* in its `THEMES` array — so
until you add your theme there, a passing `npm test` does **not** prove the contract
is complete. The 12 `--cat-N-texture` tokens are **not** in this 91-token contract —
texture is an *optional* adoption channel (recipe step 5), declared only by a
monochrome/CVD theme.

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
- `--cat-on-fill` / `--cat-on-mark` **flip** with the scheme (`var(--text-heading)`
  / a `light-dark()` pair), so the label stays legible when the fill swaps from a
  pale light tier to a jewel dark tier across canvas modes.
- `--warn` visibly distinct from `--fail` (amber vs red, not two reds).
- Contrast ratios annotated inline; the contrast test green in light and dark.

---

## What bad looks like

- A **fixed, non-flipping** `--cat-on-fill` (e.g. a dark hex) — in dark mode the
  fill is a jewel tone, so dark-on-dark drops below AA and `checkCatContrast` fails.
  The ink must flip (`var(--text-heading)`).
- `--cat-N-fill` set **equal** to `--cat-N-mark` — collapses the node and its border
  to one color (the original categorical-collapse bug); the anti-collapse floor fails.
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
- [ ] Every surface/ink/accent token is a `light-dark()` pair; the universal
      semantic palette pinned to fixed hex; `--cat-on-fill` / `--cat-on-mark` **flip**
      with the scheme.
- [ ] Categorical three-layer contract holds in BOTH modes (mark-vs-`--bg` ≥ 3:1,
      `--cat-on-fill`-vs-fill ≥ 4.5:1, fill ≠ mark) — `checkCatContrast` green;
      `--diagram-stroke` reads on white.
- [ ] `<name>-dark.css` is the 3-line wrapper.
- [ ] Gallery + mermaid gallery rendered in light AND dark and looked at.
- [ ] Full 91-token contract defined directly (not just the 10 core) — all 12
      `--cat-*` pairs, all `--hljs-*`, `--chart-*`, `--diagram-*`.
- [ ] Palette added to `test/unit/palette/token-parity.test.js`'s `THEMES` array and
      `.vscode/settings.json`; `node --test test/unit/palette/*.test.js` green.
- [ ] `npm run build:check` passes (no hex/typography/retired-name violations).

---

## Common mistakes

1. **Forgetting a required core token** → `theme "<name>" is missing N core token(s)`
   build failure.
2. **A fixed, non-flipping `--cat-on-fill`** → dark-on-jewel in dark mode, below AA
   (`checkCatContrast` fails). Flip it with `var(--text-heading)`.
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
- `engineering/textures.md` — the categorical `--cat-N-texture` adoption channel
  (the 12-token declaration for monochrome/CVD themes).
- `engineering/decisions/2026-07-15-categorical-token-contract.md` — the three-layer
  contrast contract (#1022) that retired the L≈87/L≈32 recipe.
- `engineering/typography.md` — the closed 12-token `--fs-*` system (HARD RULE #4).
- `lib/tokens/crosswalk.js` — the retired → canonical token-name map (HARD RULE
  #11).
- `lib/base/base.tokens.css` — the engine token defaults a theme inherits.
- `tools/check-ownership.js` — the gates (`checkHexLiterals`,
  `checkTypographyTokens`, `checkRetiredTokenNames`, `checkThemeTokenParity`,
  `checkCatContrast` — the categorical three-layer contrast enforcement).
