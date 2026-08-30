# Chart palette — style principles

How a theme curates the chart family to its own character — and why the
three curated themes (cuoio, onyx, indaco) read as **different yet similar**.

This is the *design rationale*. For the mechanical contract — the override
hooks, the token tables, the assessment method — see
`design/theming.md` › **Chart-family palette**. For the token definitions and
the canvas-aware fallback spectrum, see `chart-family.css`.

## One recipe, three expressions

The chart family ships a canvas-aware Apple-hue **default** spectrum, so an
untuned theme gets working charts for free. But a theme that stops there wears
*someone else's* charts — the default reads as "indaco's blues" no matter the
canvas. A curated theme re-expresses the **same recipe in its own pigments**, so
a pie and a flowchart read as one palette.

Three themes are curated today. They share a spine and differ on exactly one
axis each — that is the whole of "different yet similar."

## The shared spine — what every curation does

1. **Two spectrums, same hooks.** Every theme curates the same two token sets
   through the same `:root` override hooks: `--chart-cat1..8` (categorical) and
   `--chart-state-{pass,warn,fail,info,mute}` (semantic). A theme sets only the
   slots it wants to flavor; the `var()` indirection means the theme always
   wins, and unset slots inherit the default.

2. **Port, don't invent.** Categorical hues are lifted from the theme's *own*
   existing pigment spectrum (its `--cN` / brand palette), so charts speak the
   same color language as the theme's Mermaid diagrams. Status roles *reuse*
   the theme's living semantic palette (`--pass` / `--warn` / `--fail`, muted)
   wherever it already has one — only the roles a theme genuinely lacks are
   curated fresh.

3. **Same canvas recipe.** Each token is a `light-dark(lightVivid, darkVivid)`
   pair. Fills mix the hue **toward the canvas on light** and **toward black on
   dark** — never into the dark `--bg`, because mixing a warm hue into a navy
   canvas neutralizes to brown. Toward black the hue stays true and vivid for
   every status. Marks / ink lift toward white on dark so they pop.

4. **Assessment-first.** Score candidate values *before* committing — resolve
   the full token chain (including each chart's deep gradient stop) and check,
   on **both** canvases: text-on-fill WCAG (AA on labels), marks vs canvas
   (≥3:1), and adjacent-slot OKLab distinctness (≥0.15). A passing palette-audit
   text-contrast score is a starting point, not proof the categories are
   distinguishable.

## The distinguishing axis — what each does differently

The one decision that separates the three is **how a theme makes eight
categories distinguishable**. A theme with chroma to spare differs by **hue**;
a theme whose identity forbids a chromatic spectrum differs by **value**.

> **Rule of thumb:** a theme distinguishes categories through whatever axis its
> identity allows — hue or value — and reuses its own semantic palette for
> status, curating only the roles it lacks.

### cuoio — warm hue (brand-triad)

Categories adopt the palette audit's top-scored **earth "Brand triad"** — the
same `--cN` pigments cuoio's Mermaid diagrams use, so a pie and a flowchart are
one warm-leather palette. Status is **full reuse**: `--chart-state-*` points
straight at cuoio's own `--pass` / `--warn` / `--fail`, so a gantt at-risk bar
matches a `--warn` chip. The shipped default theme; the worked example.

### onyx — value, not hue (achromatic + red)

Onyx's identity forbids a chromatic spectrum, so categories differ by
**value**: a grayscale ramp ordered most-distinct-first, all in the dark half
so every mark clears 3:1 on white, plus the signature red and two faint accents
(slate, olive). Status draws from that same **red / olive / slate / grays**
(fail = red, warn = olive, info = slate, pass / mute = grays) — meaning is
carried by value **plus the pill's text label**, not a chromatic status code.
The counter-example that proves the recipe survives without hue.

### indaco — cool hue (+ a curated crimson)

Categories ride indaco's **blue-led pigment spectrum** (blue · rust · green ·
magenta · purple · teal · gold · cyan). Status is **reuse-first with two
edits**: pass / info / mute reuse indaco's living palette (`--pass`, brand blue,
`--text-muted`); warn ports indaco's gold to a saddle-amber; and fail is
**newly curated** — a cool crimson, because indaco's palette had no red, tuned
to sit with the blues rather than fight them. Shows the "curate only the gap"
half of the rule: seven of eight roles reuse, one is invented.

## Status is reuse-first

Categorical color is *ported* (principle 2); status color is *reused*. The
difference matters: categories are decorative identity (any well-spaced set
works), but status is **meaning** — and a theme almost always already encodes
green-good / red-stop somewhere. Reuse keeps a chart's "at-risk" reading
identical to the rest of the deck. Curate a status hue only when the theme has
no equivalent (indaco's crimson `fail`), and tune the new hue to the theme's
canvas, not a generic red.

## Curating a remaining theme — the gold-standard checklist

All 13 shipped themes are now curated to this standard — `cuoio`, `onyx`, and
`indaco` were the original exemplars and the rest (`ardesia`, `atelier`,
`brina`, `burgundy`, `carbone`, `concrete`, `crepuscolo`, `laguna`, `magnolia`,
`mustard`) followed. `test/unit/palette/chart-contrast.test.js` gates every one,
and `npm run scorecard` grades them. A brand-new theme starts on the engine's
default Apple-hue spectrum; bring it up to standard with the same recipe each
of these followed:

1. **Pick the distinguishing axis.** Does the theme have the chroma budget for
   eight well-spaced hues (cuoio, indaco) — or does its identity forbid a
   chromatic spectrum, so categories must differ by *value* (onyx)? Decide this
   first; it determines everything below.
2. **Port `--chart-cat1..8`** from the theme's *own* `--cN` pigment spectrum
   (most-distinct-first), so charts and the theme's Mermaid diagrams speak one
   color language. Eight slots max; past ~6, consolidate rather than cycle.
3. **Reuse `--chart-state-{pass,warn,fail,info,mute}`** from the theme's living
   semantic palette (`--pass` / `--warn` / `--fail`, brand accent, muted).
   *Curate only the roles the theme genuinely lacks*, and tune any new hue to the
   theme's canvas — not a generic red (cf. indaco's crimson `fail`).
4. **Assess before committing** (the procedure in `design/theming.md`): resolve
   the full token chain incl. each chart's deep gradient stop, and check on
   **both** canvases — text-on-fill AA, marks vs canvas ≥3:1, adjacent-slot OKLab
   ≥0.15. A passing palette-audit text-contrast score is a start, not proof.
5. **Verify visually.** Render the chart bucket gallery in the theme, light
   **and** dark, and read the dark canvas hardest — that is where warm-hue mud
   and value-collapse hide. Set the override hooks at `:root` in
   `themes/<name>.css`; the mechanical token tables live in `design/theming.md`.

A theme is "curated to standard" when its charts read as *its own* palette on
both canvases and clear the assessment — same as the three exemplars.

## Fill finish (a future variant)

Distinct from color, the chart family has a **fill finish** — how a fill is
shaded across its shape. There are two, assigned by geometry:

- **Bar / tile family** (kanban card, gantt bar, progress bar, state-chart node,
  status pill) — a **linear top→bottom wash** + a vivid edge/accent.
- **Solid-area family** (pie wedge, quadrant zone) — a **radial hub→rim dome**,
  the *same* 42/58/82 area-fade toward `--chart-cat-base` on both, so the two
  read as one. The dome is the **base**: charts that radiate from a center take a
  center-out fade. (Radar is neither — it stays a translucent overlay so its
  curves read through each other.)

A **flatter top→bottom wash for the solid-area pair** (matching the bar family)
was prototyped — it reads cleaner / more uniform, at the cost of the dimensional
read. It is **held as a future opt-in variant**, not shipped: when built it
should apply **family-wide to the pie *and* quadrant together** (not pie-only),
via one modifier (name TBD — e.g. `flat` / `wash`). Today's dome — indaco's
current pie/quadrant — is the reference baseline that variant would toggle off.

## See also

- `design/theming.md` › **Chart-family palette** — the hooks, token tables, and
  the full assessment procedure (the *how*).
- `chart-family.css` — the `--catN-*` / `--state-*` token definitions and the
  canvas-aware fallback spectrum (the *defaults*).
- `themes/palette-audit.md` — ranked candidate values per theme.
- `themes/cuoio.css`, `themes/onyx.css`, `themes/indaco.css` — the three
  curations in source.
