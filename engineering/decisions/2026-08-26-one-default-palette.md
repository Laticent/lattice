---
status: shipped
summary: >
  "What does a deck with no `theme:` look like?" had FIVE answers in the tree, in five files,
  none of which referenced the others, and they had already drifted. `lib/core/resolve-palette.js`
  declared `DEFAULT = 'indaco'` for the CLI and the engine; `tools/build-default-bundle.js`
  declared its own `DEFAULT_THEME = 'cuoio'` and inlined that into `dist/lattice-default.css`,
  the zero-config bundle a consumer can `<link>` with no theme selection at all; the docs-site
  Playground's `sanitizePalette` returned `cuoio` in code while its own docblock promised
  `indaco`; and TWO user-facing EXPORT paths — `tools/export-marp.js` and the Studio's
  `deck-export.js` — each hardcoded `'indaco'` of their own. The value now lives in ONE place,
  `lib/core/default-palette.mjs`, and all five read it. The
  blast radius is much smaller than it looks and the reason is worth recording — every
  committed deck in this repo already declares its `theme:`, and all four gallery/showcase
  render sites pass the palette as an EXPLICIT positional, so not one committed PDF changes.
  That pin is deliberate (a gallery is a reference surface) but it read as an oversight the
  moment it named a non-default palette, so each of the four sites now says so in place.
  ONE THING IS FLAGGED AND NOT FIXED, because it is palette curation rather than plumbing:
  promoting cuoio makes its diagram-state encoding the out-of-the-box experience, and cuoio's
  light `--diagram-done` and `--diagram-active` sit 0.0238 apart in OKLab against indaco's
  0.1089 — 4.6x tighter, measured, and visible as two near-identical gantt bars in the
  sign-off render. cuoio ships that today for anyone who selects it; this change does not
  create it, it promotes it.
tags: [theming, cli, defaults, palette, drift]
---

# One default palette (2026-08-26)

**Area:** `lib/core/default-palette.mjs` (new), `lib/core/resolve-palette.js`,
`tools/build-default-bundle.js`, `tools/export-marp.js`, the Studio's `deck-export.js`,
the three gallery builders, the CLI help text

---

## 1. Five answers to one question

A deck that names no palette — no front-matter `theme:`, no `--palette`, no
`LATTICE_PALETTE` — has to get *something*. The tree had five independent opinions:

| Declaration | Value | Who received it |
|---|---|---|
| `lib/core/resolve-palette.js:21` | `indaco` | every CLI render and the engine's own resolution chain |
| `tools/build-default-bundle.js:35` | `cuoio` | anyone who `<link>`s `dist/lattice-default.css` |
| `docs/src/lib/playground-controller.ts` `sanitizePalette` | `cuoio` in code, `indaco` in its docblock | the docs-site Playground, on an unrecognized stored palette |
| `tools/export-marp.js:293` | `indaco` | the export-to-Marp bundle a recipient renders themselves |
| `docs/src/components/studio/export/deck-export.js:224` | `indaco` | the Studio's own deck export |

Nothing referenced anything else. The bundle builder's header even explained its choice
in prose — *"The default palette is cuoio (warm leather/cream). Change DEFAULT_THEME to
re-bless a different palette"* — with no hint that a different file answered differently
for the CLI.

The third row is the instructive one: it had **already drifted internally**. Code and
comment in the same function disagreed — which is what happens to a value written down in
more places than it is derived from, and it is the strongest argument for the single module
this change introduces.

The last two rows are the ones that would have bitten a user. They are EXPORT paths, and
both agreed with the engine before this change: promoting `cuoio` without touching them
would have made a deck render one way and its own Marp bundle or Studio export render
another — the exact class of defect #1804 had just finished fixing elsewhere.

## 2. What changed

The value lives in `lib/core/default-palette.mjs` and nowhere else. All five sites above
read it, so re-blessing a different default is one edit rather than a sweep.

**Why `.mjs` for a one-line constant.** Both module systems have to read it. The CJS side —
`resolve-palette.js`, the emulator, `tools/*` — `require()`s it; the ESM side — the docs
site, the Studio export — `import`s it. That is not a new bridge: `lattice-emulator.js:742`
already does `require('./lib/theme/chain.mjs')` while `docs/src` imports the same file, so
this puts a constant on an established pattern. `resolve-palette.js` re-exports it as
`DEFAULT` so every existing consumer keeps working unchanged.

The CLI's `--help` resolution table, its usage footer, and the `export-chart-svg` /
`preview-component` docstrings named `indaco` in prose. Both of those tools also hardcoded
`'indaco'` in CODE while I was editing only their comments — caught by re-reading the diff
rather than by any gate, and the reason the sweep below exists at all.

### The near-miss that widened this

The first pass changed two tool DOCSTRINGS from `indaco` to `cuoio` and left their code
returning `'indaco'`, which would have shipped comments that lied in the opposite direction.
Re-reading the diff caught it, and grepping for the pattern rather than the two known files
then turned up `export-marp.js` and `deck-export.js` — the two that actually matter, because
they are user-facing EXPORTS. Both AGREED with the engine before this change and would have
DISAGREED after it: a divergence this change creates, so HARD RULE #18 makes it this change's
to fix rather than a follow-up to log.

## 3. Why the blast radius is nearly nil, which was not obvious

The first estimate was ~28 decks and ~28 PDFs, from counting decks with no `theme:`
directive. That estimate was wrong twice over, and both corrections came from reading the
renderers rather than the decks.

**All four gallery render sites pin the palette explicitly** — `build-galleries.js` (two
call sites), `build-bucket-galleries.js:199`, `build-showcase-galleries.js:103` all pass
`'indaco'` as a positional argument. Their output is untouched by any default change.

**Only `build-staged-pdfs.js` omits the palette** (`spawn('node', [EMULATOR, job.src,
job.out])`), and every deck in its scope — `examples/`, `examples/<dir>/`,
`design/*.gallery.md`, `exemplars/`, the CI baseline decks, `themes/palette-audit.md` —
already declares a `theme:`. Enumerated: the only files in that scope without one are two
`README.md`s and `examples/data-viz-gallery.md`, which ships no PDF at the path the builder
would write.

So **no committed PDF changes.** The first estimate came from a sloppy glob
(`design/forms.md` prefix-matching `design/forms.gallery.pdf`) plus the assumption that a
deck with no `theme:` is rendered without a palette. I could have checked either in under a minute. I checked neither before saying the
number out loud.

### The pins now say they are pins

A bare `'indaco'` literal in a render call read like an oversight the moment `indaco`
stopped being the default. It is not an oversight: a gallery is a REFERENCE surface, and
holding one palette fixed is what keeps a component diff readable across time (HARD RULE
#8). Each of the four sites carries a comment saying it is deliberately not the default
and must not be "fixed" to track it — otherwise every future default change re-renders
every gallery for no signal.

## 4. Flagged, not fixed: cuoio's diagram states are tight

Promoting a palette to default promotes its weaknesses too. Measured on the light arms,
against each palette's own canvas:

| | `--diagram-done` vs `--diagram-active`, OKLab | done vs canvas | active vs canvas |
|---|---|---|---|
| indaco | **0.1089** | 1.62:1 | 1.66:1 |
| cuoio | **0.0238** | 1.27:1 | 1.22:1 |

At 0.0238 the two gantt states are very nearly the same fill, and the sign-off render of
`examples/data-viz-gallery.md` shows it: the "done" and "live" bars read as one warm gray
where indaco separated them into blue and peach.

**This is not a regression this change creates.** cuoio has shipped those values and any
deck selecting cuoio sees them today; what changes is that they become the out-of-the-box
experience. Re-tuning them is palette curation with its own blast radius — every cuoio deck
moves — and that is a design decision, not plumbing, so it is recorded here and left to its
owner rather than folded in silently (HARD RULE #18's off-path branch: log it, do not pull
it into the diff).

## 4b. The flip woke a dead code path in the Studio export

Driving the export paths rather than reasoning about them turned up a behavior change
this note had missed. `deck-export.js` bundles themes through a rescue loop:

```js
let chosen = (palette || DEFAULT_PALETTE).toLowerCase();
for (const cand of [chosen, 'indaco']) { ... }
```

The second candidate rescues "the chosen palette's files did not fetch", so it is
deliberately a FIXED known-good palette rather than `DEFAULT_PALETTE` — retrying the name
the first pass already failed on would be a no-op, and `indaco` is the historical base
that is always present in the staged directory.

**That retry was DEAD until this change.** With the default at `indaco`, a palette-less
deck set `chosen = 'indaco'` and the loop ran `['indaco', 'indaco']`; the second pass
could never contribute. Moving the default to `cuoio` is what made it live, without
touching the line. The effect is benign and arguably an improvement — a failed cuoio
fetch now yields a renderable bundle instead of an empty one — but it is a behavior
change on a user-facing export path, and nothing in the diff pointed at it. The line
now carries a comment saying both halves: why the palette is fixed, and that this
change is what woke it.

**Marp export, driven.** `node tools/export-marp.js examples/data-viz-gallery.md` on an
un-themed deck reports `palette: cuoio` and bundles `themes/cuoio.css` +
`themes/cuoio-dark.css`, carrying `--brand-accent: #7A5A10` — cuoio's own value, with no
indaco file in the bundle. That is the export half of the claim, on a real artifact.

## 5. Not verified

- The sign-off render is `examples/data-viz-gallery.md` — a real un-themed deck, so it is
  the right subject, but it is one deck. No sweep across components was run for the default
  change, on the grounds that cuoio's rendering is unchanged by it; only which decks receive
  cuoio changed.
- The docs-site Playground was not driven. `sanitizePalette`'s code already returned `cuoio`,
  so its behavior is unchanged; only its docblock was wrong and is now fixed.
- `examples/data-viz-gallery.{light,dark}.pdf` have **no producer** — no tool in `tools/`
  references that deck, and `build-staged-pdfs.js` would write `examples/data-viz-gallery.pdf`,
  which does not exist. That is the orphaned-golden class #1279 named, it predates this change,
  and it is logged here rather than fixed.
