---
status: shipped
summary: >
  "What does a deck with no `theme:` look like?" had SIX answers in the tree, in six files,
  none of which referenced the others, and they had already drifted. The first draft of this
  note found five and claimed that was all of them; an independent checker found the sixth. `lib/core/resolve-palette.js`
  declared `DEFAULT = 'indaco'` for the CLI and the engine; `tools/build-default-bundle.js`
  declared its own `DEFAULT_THEME = 'cuoio'` and inlined that into `dist/lattice-default.css`,
  the zero-config bundle a consumer can `<link>` with no theme selection at all; the docs-site
  Playground's `sanitizePalette` returned `cuoio` in code while its own docblock promised
  `indaco`; and TWO user-facing EXPORT paths — `tools/export-marp.js` and the Studio's
  `deck-export.js` — each hardcoded `'indaco'` of their own; and `tools/build-marp-kit.js`
  declared `THEME = 'cuoio'` under the comment "The default palette", feeding the PUBLISHED
  kit. The value now lives in ONE place, `lib/core/default-palette.mjs`, and FIVE OF THE SIX
  read it — the exception is the Playground's `sanitizePalette`, which already returned
  `cuoio` in code and needed only its docblock corrected. The
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

## 1. Six answers to one question

A deck that names no palette — no front-matter `theme:`, no `--palette`, no
`LATTICE_PALETTE` — has to get *something*. The tree had six independent opinions.
The first draft of this note listed five; the sixth is the last row, and an independent
checker found it:

| Declaration | Value | Who received it |
|---|---|---|
| `lib/core/resolve-palette.js:21` | `indaco` | every CLI render, and the tools that call it (not `lib/engine`, which never calls `resolvePalette`) |
| `tools/build-default-bundle.js:35` | `cuoio` | anyone who `<link>`s `dist/lattice-default.css` |
| `docs/src/lib/playground-controller.ts` `sanitizePalette` | `cuoio` in code, `indaco` in its docblock | the docs-site Playground, on an unrecognized stored palette |
| `tools/export-marp.js:293` | `indaco` | the export-to-Marp bundle a recipient renders themselves |
| `docs/src/components/studio/export/deck-export.js:224` | `indaco` | the Studio's own deck export |
| `tools/build-marp-kit.js:68` | `cuoio` | `dist/marp-kit/`, a PUBLISHED artifact (`publish-kits.yml`) |

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

The value lives in `lib/core/default-palette.mjs`. **Five of the six sites now read it**;
the sixth, `docs/src/lib/playground-controller.ts`, does NOT — its `sanitizePalette`
already returned `cuoio` in code and only its docblock was wrong, so this change fixed the
prose and left the literal. An earlier draft of this section claimed all of them read the
module, which §5 then contradicted; an independent checker caught the two halves
disagreeing inside one document.

**A SIXTH declaration existed and the first draft missed it.** `tools/build-marp-kit.js`
declared `const THEME = 'cuoio'` under the comment *"The default palette"* — the same
question, answered again twenty files away, feeding a PUBLISHED artifact
(`publish-kits.yml`). A re-bless would have left `dist/marp-kit/` shipping the old pair
with every gate green and that file's own docblock turned into a lie: the exact drift this
note exists to end, reintroduced by the change that ended it. It reads the module now.
`kit/Sample-Deck.md`'s front matter is coupled to it and a re-bless has to move it too.

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

| | `--diagram-done` vs `--diagram-active`, OKLab | done vs `--bg` | active vs `--bg` |
|---|---|---|---|
| indaco | **0.1089** | 1.62:1 | 1.66:1 |
| cuoio | **0.0238** | 1.32:1 | 1.27:1 |

The cuoio contrast pair is corrected here: an earlier draft printed 1.27 / 1.22, which an
independent checker could not reproduce against any of the 143 hex literals in
`themes/cuoio.css`. Measured against `--bg` — the same background the indaco row uses — the
pair is 1.32 / 1.27. **The OKLab figures both reproduce exactly**, so the headline holds:
cuoio's two states sit 4.6x closer together than indaco's. This section is a hand-off to
the palette owner, who will re-measure, so the numbers have to survive that.

At 0.0238 the two gantt states are very nearly the same fill, and the sign-off render of
`examples/data-viz-gallery.md` shows it: the "done" and "live" bars read as one warm gray
where indaco separated them into blue and peach.

**This is not a regression this change creates.** cuoio has shipped those values and any
deck selecting cuoio sees them today; what changes is that they become the out-of-the-box
experience. Re-tuning them is palette curation with its own blast radius — every cuoio deck
moves — and that is a design decision, not plumbing, so it is recorded here and left to its
owner rather than folded in silently (HARD RULE #18's off-path branch: log it, do not pull
it into the diff).

## 4b. A claim this note got wrong, and what driving the export actually showed

An earlier draft of this section said the flip "woke a dead code path" in
`deck-export.js`'s rescue loop, `for (const cand of [chosen, 'indaco'])`. **An independent
checker refuted it on two counts, and both are worth keeping.**

**The retry was never dead.** The pre-existing comment nine lines above says what it is
for: *"Fall back to the default palette if the deck's theme isn't a served built-in (e.g. a
Workbench library theme)."* A deck on a library theme sets `chosen = 'my-brand'`, pass 1
fetches nothing, pass 2 rescues it. That path ran before this change and is untouched by
it. Only the narrower palette-*less* case was a no-op.

**And that narrower case is unreachable from the real Studio.** `StudioShell.tsx:742`
seeds the palette from `localStorage` or its own `DEFAULT_PALETTE` and passes it down
through `ShareSheet` to `exportMarp`, so `palette` is never empty and
`palette || DEFAULT_PALETTE` never takes its right-hand branch in the app. The "behavior
change on a user-facing export path" the draft recorded is, on the surface a user touches,
no change at all.

**Keep the literal.** Reading `DEFAULT_PALETTE` there would degenerate the loop to
`['cuoio','cuoio']` for exactly the palette-less deck — the no-op the rescue exists to
avoid. One real fragility survives and the comment now names it: `indaco` works only
because `sync-playground-assets.mjs` stages every `dist/themes/*.min.css`. Nothing pins
that name, so a rename would turn the rescue into a silent no-op with no gate.

**What did hold: the Marp export, driven.** `node tools/export-marp.js
examples/data-viz-gallery.md` on a genuinely front-matter-less deck reports `palette:
cuoio` and writes `themes/cuoio.css` + `themes/cuoio-dark.css` carrying
`--brand-accent: #7A5A10`, with no indaco file in the bundle. The checker reproduced it.

**The lesson is the one this note keeps relearning.** The draft reasoned about the loop
from the diff instead of from the call chain, and produced a confident, wrong claim — in a
shipped code comment. Reading one file is not reading the path.

## 4c. What the independent checker found

HARD RULE #25's maker-checker rung ran on this diff after the owner authorized it. It
returned **thirteen confirmed findings**, and the count is the point: every machine gate
was green when it started, and none of the thirteen was visible to one.

The three that were defects rather than prose, all fixed here:

| | Finding | Fix |
|---|---|---|
| 1 | **A SIXTH declaration.** `tools/build-marp-kit.js` declared `const THEME = 'cuoio'` under the comment *"The default palette"*, feeding the PUBLISHED kit. A re-bless would have left `dist/marp-kit/` shipping the old pair, every gate green, that docblock a lie | reads the module |
| 2 | **Nine shipped doc lines still said `indaco` is the default** — `README.md` (the npm front page), `design/skill.md` and `design/skills/deck.md` (both in `package.json` `files`, and the deck-authoring contract agents read), the live docs site | corrected |
| 3 | **Nothing pinned the VALUE.** Both changed tests now read the constant, which is right per case, but that removed the only thing asserting *which* palette it is. A one-character edit changed every palette-less render with 7544 tests green | one assertion, mutation-proved: flipping the constant to `burgundy` fails it |

The rest were false or imprecise claims in this note, the changelog and one shipped code
comment — the orphaned-golden claim (§5), the "dead code path" story (§4b), the cuoio
contrast pair (§4), "all five sites read it" (§2), three docstrings pointing at the
re-exporter instead of the declaration, and two more uncommented `indaco` pins the comment
sweep had missed (`build-component-docs.js:593`, which writes `theme: indaco` into 63
generated galleries, and `regression-gate.mjs`, which mirrors `build-galleries.js`
verbatim). All corrected in place.

**What this cost and what it bought.** One agent, ~158k tokens, ~17 minutes. It caught a
published-artifact drift bug that recreated the exact defect class this note exists to end,
inside the change that ended it. The maker had already self-reviewed twice and run every
gate.

## 4d. Every surface the change touches, driven

The `evidence` axis of the pre-merge card sat at `medium` because the change reaches eight
surfaces and only three had been driven. All eight now carry an artifact. Sampled with
ImageMagick where the surface is a raster; read from the emitted stylesheet where it is
text. cuoio's canvas is `#FAF7F2`; indaco's is `#FFFFFF`, so the two are trivially
distinguishable in a pixel.

| Surface | How it was driven | Result |
|---|---|---|
| CLI HTML | computed `--accent` / `--text-body` off `document.documentElement`, real Chromium | cuoio |
| CLI PDF | four before/after sign-off renders, light + dark | cuoio |
| **PPTX** | `out.pptx` unzipped, `ppt/media/image-3-1.png` pixel-sampled | `srgb(250,247,242)` = `#FAF7F2` |
| **Image set (`.zip`)** | `slides/player-03.png`, `-04.png` pixel-sampled | `#FAF7F2` |
| **Player (`--player`)** | emitted stylesheet read | `--bg:#FAF7F2` light, `#15110D` dark |
| Marp export (CLI) | `tools/export-marp.js` on an un-themed deck | `palette: cuoio`, bundles `cuoio.css` + `cuoio-dark.css`, no indaco file |
| **Studio export flow** | real browser: Studio to Share to Marp bundle to Download, the `.zip` captured over CDP and unpacked | `themes/cuoio.css` + `cuoio-dark.css`, `brand-accent: #7A5A10`, **zero** indaco files |
| **Docs Playground** | driven on the local dev server | `data-palette="cuoio"`, `--bg: #FAF7F2` |

Two of these are worth their own line.

**The Studio export is the surface this note previously got wrong** (§4b), so driving it
mattered more than the others. Its deck — the Studio starter — declares no `theme:` in its
markdown, yet the bundle carries cuoio and nothing else. That is the corrected §4b account
confirmed from the outside: `StudioShell` supplies the palette from its own state, the
rescue loop's first pass succeeds, and the `'indaco'` literal never runs.

**The Playground result proves less than it looks like.** Its `cuoio` comes from
`docs/src/lib/site-chrome.ts`, which this change does not touch and which already said
`cuoio` on `main`. Driving it confirms no regression; it is not evidence the change works.
The checker caught an earlier version of this note making exactly that inference about the
docs site, and the distinction is kept here so it is not made again.

**One pre-existing warning, ruled out as not this change's.** Every player render prints
`Could not parse CSS @import URL "lattice" relative to base URL "about:blank"`. It also
prints on a deck that declares its own `theme:`, where the default is irrelevant, so it
predates this change. Logged, not fixed (#18, off-path).

## 5. Not verified

- The sign-off render is `examples/data-viz-gallery.md` — a real un-themed deck, so it is
  the right subject, but it is one deck. No sweep across components was run for the default
  change, on the grounds that cuoio's rendering is unchanged by it; only which decks receive
  cuoio changed.
- ~~The docs-site Playground was not driven.~~ It is now (§4d) — and the result is weaker
  evidence than it appears, because the Playground's `cuoio` predates this change.
- ~~`examples/data-viz-gallery.{light,dark}.pdf` have no producer.~~ **Refuted by an
  independent checker.** `tools/build-showcase-galleries.js:44` registers `id: 'data-viz'`
  and writes `examples/<id>-gallery.<theme>.pdf`; `build-showcase-galleries.js --check`
  exits 0 over exactly those two files, `build-staged-pdfs.js` routes edits to that deck to
  `{kind:'showcase'}`, and `build:showcase-galleries:check` gates their freshness. It is one
  of the better-owned artifacts in the tree. The conclusion it was cited for — no committed
  PDF changes — still holds, because that showcase render pins `'indaco'` positionally, but
  the stated reason was wrong and would have sent a future reader hunting for a producer
  that already exists.
