---
status: shipped
summary: >
  #1527, landed. `lattice-emulator.js` built the deck stylesheet palette-FIRST, so
  `lib/base/base.tokens.css`'s plain `:root` block landed later at equal specificity and won
  — and it was the ONLY one of four sites that ordered them that way. The two sheets are now
  engine-first, palette-last: the order every theme's own `@import 'lattice';` declares, the
  order the file's own Mermaid token reader already parsed, and the order `lib/engine`'s
  composeCss has always given the Studio and the Playground.
  MEASURED AGAINST THE TREE IT ACTUALLY LANDED ON, which is not the tree it was designed
  against: #1789 shipped while this branch was at the sign-off gate and made every palette's
  curated STATUS TRIO reach the page by a different route — a `:root:root` specificity bump
  that beats the bundle in either order. So the trio, its tints and `--chart-state-*` no
  longer move here, and the flip's delta is 675 declarations across 28 tokens on all 32
  palettes rather than the 925 across 37 measured before. What is left is the twelve
  `--hljs-*` plus `--code-text`, the eight `--diagram-*`, `--seq-500`, `--on-accent` and the
  `--on-dark-*` tail — and the retirement of a split where nine tokens resolved one way in
  the CSS and another in the Mermaid bake of the same render. Re-swept on the new base: 64 of
  64 grid states still change at least one slide, 78 of 640 slide instances, 45 of 380 across
  the 38 distinct states; 36 of those 38 change exactly one slide, the `code` panel.
  The flip surfaced one regression and fixed a louder one on the same surface. `journey`'s
  actor dot is the ONLY site in the component library that paints `--on-accent` over a
  CATEGORICAL MARK rather than over `--accent`: `carbone` had been shipping it at 1.91:1
  because the engine's white won the cascade, and the flip takes it to 4.89:1, while
  `atelier`'s warm off-white went the other way, 4.57 to 3.91. Atelier's light arm is lifted
  the minimum that clears. No token in this repo carries an "AA on any categorical mark"
  contract — measured, every candidate — so the structural fix is a per-slot ink derived
  against the mark, sized and logged as its own slice.
builds-on: 2026-08-11-palette-concat-signoff.md
---

# The palette wins the cascade

**2026-08-24 · #1527 · branch `claude/status-trio-monochromacy-respacing-s7jzuq`**

**Area:** `lattice-emulator.js`, `lib/core/export-shell-marks.js`, `tools/palette-sweep.js`,
`tools/check-ownership.js`, `tools/composed-contrast.js`, `themes/*.css`,
`lib/base/base.tokens.css`

## 1. What actually changed

One expression, and a sentinel that exists because of it.

```js
- const css = paletteCSS + '\n' + layoutCSS;
+ const css = layoutCSS + '\n' + paletteCSS + '\n' + PALETTE_END_MARK + '\n';
```

`2026-08-10-palette-concat-order.md` established the mechanism and
`2026-08-11-palette-concat-signoff.md` produced the package the QUALITY BAR asks for and
stopped. Neither shipped the flip. This note is the landing, and it carries three things
those two could not: the repair list is complete rather than pending, the sweep is re-run
against a corpus that has moved a long way since August 11, and the follow-up they
handed forward turns out to be blocked for a reason nobody had measured (§5).

**The sentinel.** `tools/palette-sweep.js` re-themes an already-rendered deck by
overwriting the palette's byte range in place — appending a `<style>` puts it at the wrong
cascade position and reports numbers describing no rendered pixel, which is a mistake that
tool has already made once. It bounded the region with the two sheets' own opening banners.
With the palette LAST there is no banner after it, so the shell now emits
`/* lattice:palette-end */` and both writer and reader take it from one module
(`lib/core/export-shell-marks.js`). Guessing the end — "the next literal rule in the shell" —
would have put that tool back to measuring a hybrid the first time that rule moved.

## 2. Why it was safe to land now, checked rather than assumed

The sign-off package listed what had to be true first. Each was re-verified against the tree
rather than taken from the note:

| prerequisite | state |
|---|---|
| `indaco` `--hljs-literal` 3.71:1 — live in BOTH orders, so no order-comparing sweep could find it | repaired, `#ff7f8e` at 4.67:1 |
| `cuoio` `--hljs-literal` 4.05:1 — only reachable after the flip | repaired, `#CC6574` at 4.68:1 |
| an `--hljs-* × --code-bg` AA gate, landed AHEAD of the flip | `checkHljsContrast`, green; it is what found the indaco defect |
| the four a11y palettes' flat dark status grays — the package's one "shipping this exports an unreadable accessibility deck" | all four carry `light-dark()` pairs now, and #1789 has since made the whole trio reach the page independently of this flip |

The last row was the loudest objection in that file, and it is worth stating precisely
because **this change no longer owns it.** On 2026-08-11 `a11y-achromatopsia` declared
`--pass: #4d4d4d` flat, which on its dark canvas measured **2.48:1** with the icons and rails
effectively gone. It is a `light-dark()` pair now and the same composed surface reads
**9.43:1** (`checklist/pass-row`; warn 6.25, fail 13.30) — but what delivers that to an
EXPORTED deck is #1789's `:root:root` bump, which beats the bundle in either order, not the
concat. The prerequisite is met; the credit is not this branch's, and §3 is measured on the
tree that already contains it.

## 3. Measured: what the flip activates

**Token level, exhaustive.** Every declaration in every theme, resolved in real Chromium
under each order and compared. This repeats the harness in
`2026-08-10-palette-concat-order.md` §2 verbatim, so the two numbers are comparable:

| | 2026-08-10 | before #1789 | **as landed** |
|---|---|---|---|
| themes with at least one activated declaration | 32 of 32 | 32 of 32 | **32 of 32** |
| activated declarations, counted per theme as loaded | 932 | 925 | **675** |
| distinct tokens affected | 36 | 37 | **28** |

**The middle column is why this note has three.** #1789 landed while this branch sat at the
export sign-off gate, and it makes every palette's curated status trio reach an exported deck
by a different mechanism: declaring the trio at `:root:root` as well as `:root`, which is
(0,2,0) and therefore beats the bundle whichever order it is concatenated in. So `--pass`,
`--warn`, `--fail`, their `-bg` tints and `--chart-state-*` stop differing between the two
orders, and 250 declarations leave this change's ledger. Re-measured rather than
back-calculated.

What is left is still every palette: the twelve `--hljs-*` plus `--code-text`, the eight
`--diagram-*`, `--seq-500`, and a short tail (`--on-accent` on 5 themes, `--on-dark-*` on 2,
`--seq-pole-*` on 1). Worst is `carbone` and `cuoio` at 25 declarations; lightest is `indaco`
at 11.

**Render level.** A ten-slide deck built from live gallery slides — `divider`, `code`,
`roadmap`, `checklist`, `gantt`, `kanban`, `piechart`, `redline`, `word-cloud`, `closing` —
rendered through the real CLI at every theme and both modes, screenshotted per slide, then
re-screenshotted with the palette region moved back in front of the engine bundle. Comparing
in ONE rendered document rather than across two CLI runs is deliberate: it makes the cascade
order the only difference, and it is faithful because the Mermaid bake never depended on the
injected order (`PALETTE_VARS` has always parsed `layoutCSS + paletteCSS`).

| | before #1789 | **as landed** |
|---|---|---|
| theme-modes in the grid | 64 | **64** |
| …with at least one changed slide | 64 of 64 | **64 of 64** |
| changed slide instances | 346 of 640 | **78 of 640** |
| **DISTINCT** states | 38 | **38** |
| **DISTINCT** changed renderings | 197 of 380 | **45 of 380** |

The grid double-counts and the distinct figures are the honest ones: 13 of the 32 theme files
are `-dark` wrappers whose only content is `color-scheme: dark`, and at a FIXED `color-mode:`
directive a wrapper renders identically to its parent — visible in the data as every
`X-dark/mode` row matching its `X/mode` row exactly.

**Every state still changes, and the shape of the change is now narrow.** 36 of the 38
distinct states change exactly ONE slide — the `code` panel, because every palette curates
twelve `--hljs-*` and none of them reached an export before. The two that change more are
`cuoio` (6 of 10 dark, 3 light), the palette with the most declarations of its own. So the
honest one-line reading is no longer "half the corpus moves": it is **every palette's code
panel, plus cuoio.**

*(The sign-off package reported 36 distinct states from a nine-slide deck. The difference is
arithmetic, not disagreement: it treated `a11y-base` as a wrapper of `onyx`, and it is not one
— it declares tokens of its own. 32 − 13 wrappers = 19 identities × 2 modes = 38.)*

## 4. Looked at, not only counted

The QUALITY BAR asks for someone to open the image, and it has already paid for itself twice
in this swimlane — once when "11 regressions" would have blocked the flip for the wrong
reason, once when "the palettes were authored to be seen" would have shipped an unreadable
deck. Sixty-five before/after pairs across six palettes went to the owner as a contact sheet.

**That sheet was rendered BEFORE #1789 landed**, so two of its three most striking pairs — the
`concrete` checklist and the `a11y-achromatopsia` dark checklist — are that change's doing and
not this one's. They are kept below because they document the surface honestly, labelled for
what they are. The pairs that are still THIS change's are the `code` panel on every palette
and the `--diagram-*` families on the palettes that curate them.

- **`cuoio` dark, `code` — the case FOR the flip.** Before: Night Owl's purple `function`,
  pink literals and orange numbers on cuoio's warm brown panel, a borrowed ramp meeting a
  panel it was not chosen for. After: cuoio's own terracotta strings, amber titles and lime
  built-ins. It is visibly of-a-piece with the theme, and it is what cuoio's author wrote.
- **`concrete` light, `checklist` — a cost, now visible, and NOT this change's.** Concrete's
  `--pass` is `#000f01`, and an export paints it now: the done rows carry a near-black tick
  where the engine's forest green used to be, and warn is a dark brown. #1801 recorded this as
  forced by the arithmetic (concrete's mid-gray canvas caps every status ink at weight 0.40)
  and signed it off — but it signed off a value that had never rendered outside a preview.
  #1789 is what put it on the page. Recorded here because the contact sheet shows it and a
  reader deserves to know which change to look at.
- **`ardesia` light, `gantt` — the one place a signal gets QUIETER.** The at-risk bar goes
  from the base's coral `--diagram-critical` to ardesia's muted ochre. Everything stays legible
  and the palette is doing what its author asked, but "at-risk" reads less alarming than it
  did. Worth knowing it is a consequence of this change rather than of #1685.

## 5. The follow-up this was supposed to unblock, and why it is not unblocked

`2026-08-24-status-trio-monochromacy-respacing.md` §6a specified the sequel exactly: flip the
order first, then respace base's own status trio (which is collapsed under monochromacy at
0.0580 light and **0.0033** dark), then re-check `concrete` — "because with the palette
winning, concrete's own trio is what renders and the cascade-regression bar no longer binds
it."

**That last clause is false, and it was worth an hour to find out.** `composed-contrast`'s
REGRESSION arm computes BOTH cascade orders analytically, from two merged token maps. It never
consulted what the export does, so the flip could not relax it and did not. Applying §6a's
solved values (light `#17572d`/`#b35308`/`#5f0005`, dark `#a1ffbb`/`#fa7419`/`#ffadaa` — they
do clear the floor at 0.1252 and 0.1246, re-derived here) fires exactly the six regressions
§6a predicted, flip or no flip:

```
concrete|light|policy-recommendation/oppose-badge  5.68 -> 3.98  (need 4.5)
concrete|dark|redline/del                          5.12 -> 3.91
concrete|dark|redline/old-label                    5.92 -> 4.35        (+ the concrete-dark mirror of each)
```

The comparison is fair, which is what makes it binding: `base.tokens.css` declares no `--bg`,
so both arms score the same ink stack on `concrete`'s own canvas. Improving the fallback
raises the bar the override is measured against.

**Its light arm re-solves; its dark arm does not.** Searching each token's OKLCh lightness on
a 0.005 grid, hue and chroma held, constrained by the real gates (`evalSurface` over
`SURFACES` in both orders, `KNOWN_SUB_THRESHOLD`, the degrade tolerance, the 0.11 monochromacy
floor) rather than by a model of them:

- **light:** `#000900` / `#301900` / `#7d000b`, worst pair 0.1129, every surface clean — a
  small move from today's `#000f01` / `#3b2000` / `#8d0812`.
- **dark: infeasible, and the arithmetic says why.** `redline/del` needs `--fail` at
  achromatopsia weight **≥ 0.786**; AA on the composed surfaces floors `--pass` at ~0.79 and
  `--warn` at ~0.78; the ceiling is white at 0.99. That is **0.21 of range where three signals
  mutually ≥ 0.11 need 0.22.** Every one of the 112 mono-feasible combinations fails a surface.

There is a way out and it is a real design change, not a tweak: concrete's own-hue tint is
`color-mix(--fail 12%)`, so the band moves with the ink. Cutting it to 6% drops `--fail`'s
floor to ~0.735 and reopens the range. That is a visible change to concrete's redline band and
status pills, made to land a default that — **after this flip** — no themed deck renders at
all: all 32 palettes declare the full trio, so base's default now paints only on the UN-THEMED
bundle (the golden corpus, and a bare `dist/lattice.css` consumer).

So the respacing is a smaller change than it was and a more expensive one, and it belongs in
its own slice with concrete's re-tune, not stapled to a cascade flip. This section is the
starting point for it: the light arm is solved, the dark arm's blocker is quantified, and the
escape route is named.

## 5a. The contrast prober, found twice and fixed once

This branch went red on `palette-sweep`: `cuoio-dark` at 7 sub-threshold runs against a
ceiling of 5, the two new ones `redline`'s `<del>` at **4.18:1**. The obvious reading is that
cuoio's own `--fail` (`#ed6868`) is darker than the engine's `#F87171` that used to paint
there, so cuoio needs a re-tune. That reading is wrong, and every cheap way of "fixing" it
would have been damage.

**The pixels settle it.** Screenshotting the three `<del>` runs on that slide and counting
colors: the dominant background behind ALL THREE is the same `rgb(51,33,29)` — 4.89:1 against
`#ed6868`, above the floor. Two of them were being *scored* against `rgb(68,43,37)`, a
backdrop nothing paints. The cause is a documented approximation in `PROBE`: `under()` tested
underlay containment against `node.getBoundingClientRect()`, and for an INLINE box that wraps
that rectangle is the UNION of its line fragments — it spans the ragged gap at the end of
every line, where the element paints nothing. A two-line `<ins>` beside those `<del>`s had a
3138×194 union box that swallowed the whole paragraph, so its 10% tint was composited into
their backdrop twice.

**#1789 found the same defect independently and fixed it first, on `atelier` rather than on
`cuoio-dark`, and its fix is what ships.** This branch's version was the same one line of
geometry with a narrower fallback; on rebase it was dropped in favour of the landed one, which
falls back to the bounding box when an element generates no client rects at all. Two branches
arriving at one line of `under()` from different palettes in the same week is worth recording
precisely because neither found it by reading the code: both were sent there by a rendered
number that disagreed with a screenshot.

What this branch keeps is the **symptom entry** (`engineering/gotchas/css.md`, "A contrast gate
reports sub-AA for a run the rendered pixels show clearing"), because #1789 landed the fix
without one, and the transferable lesson is the method rather than the patch: when a rendered
gate and an analytic gate disagree, sample the pixels — do not re-derive from the model that
produced the number. The check that either fix WAS a fix is that the two gates now agree to a
hundredth (`concrete-dark` redline/del: 3.91 modeled, 3.89 rendered) where they had differed
by 0.7.

## 5b. `journey`'s actor dot pairs an accent ink with a categorical mark

The flip's one regression, and it comes with a louder repair on the same surface.

`journey.styles.css:223` paints `color: var(--on-accent, var(--on-dark-primary))` on
`background: var(--actor-color)`, and `--actor-color` is a `--cat-N-mark` (slots 1–8, from
`JOURNEY_ACTOR_PALETTE`). That is an ink curated for `--accent` used over a CATEGORICAL mark,
and it is the only site in the component library that does *that*.

**The class it belongs to has a SECOND member, and an earlier draft of this section missed
it** by generalizing from the one instance it had measured. `base.variants.css:377` paints
`color: var(--on-accent)` on `background: var(--stamp-color)`, which is `var(--fail)` for
`.confidential`/`.redacted`, `var(--warn)` for `.wip`/`.draft` and `var(--text-muted)` for
`.tbd`/`.archived` (`base.variants.css:278-285`). Not a categorical mark — but the same
mistake: an accent-paired ink over a backdrop that is not `--accent`. Found by an independent
checker, not by this branch.

Its one regressing configuration is `carbone` at `color-mode: light`, where the stamp goes
**7.43:1 → 2.60:1** (carbone's near-black `#0E0E10` on `--fail`'s light arm `#A22525`, where
the engine's white used to paint). **It is not a blocker, for a reason the repo wrote down in
advance rather than one invented here:** `themes/carbone.manifest.json` declares
`modes: ["dark"]` and its note says an author needing a light carbone "should pick a different
palette rather than override color-scheme"; `paired-token-parity.test.js` exempts carbone's
flat `--on-accent` explicitly, records that `section.light` DOES reach past its pin, and
adjudicates the token against THIS flip — #1640 item 3 measured it an improvement, 1.59:1 →
12.15:1 on `--accent`, which the checker reproduced. This is the exemption's stated cost
arriving in a mode the palette declares it does not have — the same class the 2026-08-11
sign-off already adjudicated for the a11y palettes' dark arms.

What it does expose is a false comment: carbone's own header says a light author "gets an
unstyled deck … the correct failure mode", and that is not what happens — the CLI honors
`color-mode: light` and renders a fully styled deck with one illegible stamp. Corrected in
place. The stamp surfaces are also absent from `SURFACES` in `tools/composed-contrast.js`,
which is why no gate saw any of this; logged in §8.

It had never been right; the engine's white was masking it in both directions.

| palette | today (engine wins) | after the flip |
|---|---|---|
| `carbone` light | **1.91:1** — shipping, on a bright cyan mark | **4.89:1** |
| `atelier` light | 4.57:1 — white, clearing by 0.07 | **3.91:1** |

So the flip fixes a live AA failure on one palette and creates one on another. Atelier's
light `--on-accent` is lifted `#F0EDE6` → `#FFFEFB` (OKLCH L 0.946 → 0.996, hue and chroma
held), the minimum that clears its own worst mark at 4.53:1. The cost is confined to warmth —
15.42:1 → 17.28:1 on `--accent`, both far above any floor — and it is imperceptible in a
rendered journey legend, which was checked rather than assumed.

**The structural fix is a different slice, and it was sized before being deferred.** There is
no token in this repo with an "AA on any categorical mark" contract. Measured against every
slot-1–8 mark on every palette, **excluding the five `a11y-*` palettes** — they carry
near-black marks whose dark arms are an unsupported mode, and including them drops every row
below to 1.28–1.55, which measures that exclusion rather than the candidate:

| candidate ink | worst |
|---|---|
| `--bg` | 3.27 (`concrete`) |
| `--bg-alt` | 3.46 (`atelier`) |
| the slot's own `--cat-N-fill` | 2.76 (`carta`) — 132 sub-AA rows; fill↔mark is a 3:1 graphical pair |
| `light-dark(#fff, --surface-inverse)` | 1.91 (`carbone`, whose canvas is dark in BOTH modes) |
| `--surface-inverse` · `--text-heading` | 1.08 · 1.04 |

No mode-keyed rule can work, because `carbone` is dark in both modes and the ink has to track
the MARK's lightness rather than the canvas's. `contrast-color()` is not available at this
engine's Chromium floor. So the answer is a per-slot ink derived against the mark — the shape
`tools/derive-cat-ink.js` already implements against the canvas — which is a token family, a
generator, a gate and a visual pass across 32 palettes. That is its own change; lifting one
palette's `--on-accent` is what this one owes.

## 6. The gates that modeled the OLD cascade

A gate encodes a model of where a value lands, and that model is the thing most likely to be
wrong — the lesson `2026-08-11-palette-concat-signoff.md` §7e drew after four defects in one
swimlane. Flipping the cascade invalidates every such model at once, so they were changed with
it rather than left to rot green:

- **`checkHljsContrast`** judged the base against EVERY panel in the corpus, because the base
  won everywhere. It now judges the base against its own panel plus any panel that INHERITS
  the token. **That set is empty today** — all 32 declare all twelve — so the emptiness is
  asserted out loud in `hljs-contrast.test.js` rather than left to make the arm vacuous. The
  base's two solved-for-the-whole-corpus values are KEPT: the extra margin is now deliberate
  slack, so a palette that ever drops one inherits something already safe.
- **`hljs-contrast.test.js`'s indaco arm** paired the BASE's value with indaco's panel, which
  was the real surface and is now a combination nothing renders. It asserts indaco's own value,
  and asserts that indaco still declares it.
- **`tools/palette-sweep.js`** — the region markers, §1.
- **`composed-contrast.js`** described the palette-wins order as "the order the export path
  takes once #1527 lands". Its docblock now also records the coupling §5 found, because the
  next person to improve a base default will hit it.
- **Prose in `base.tokens.css`** at four blocks, and in the four `a11y-*` palettes, `cuoio` and
  `indaco`, all of which said some arm was "inert until #1527 flips the order".

**Two exemptions keep their shape and lose their reason.** `--cat-N-ink` and
`--code-inline-fg` have no `:root` default in the base precisely because it would have beaten
the palette. That hazard is gone. Neither default is being added here — declaring twelve
categorical inks and holding them to AA on every canvas is a change with its own case to make,
and `2026-08-10-palette-concat-order.md` §5 said in advance not to fold it in. The comments now
say the reason is historical, so nobody re-derives the old one from a stale note.

## 7. How it is pinned

`test/integration/export/palette-cascade-order.test.js` renders the REAL CLI at `indaco` and
reads the tokens off the rendered `<section>` in Chromium.

**Deliberately not a text match on the concat expression.** That assertion reads natural and
proves nothing: `layoutCSS + paletteCSS` is one edit away from being defeated by a `@layer`, an
`!important`, a second `<style>` element, or Marpit's `:root`→`section` packing, all of which
decide the same question and none of which a string comparison can see.

It also reads only DISPUTED tokens — ones indaco and the base spell differently — and asserts
there are at least four of them. A token both sheets spell identically cannot tell the two
orders apart, which is exactly how #1527's own before/after sweep missed indaco's sub-AA
`--hljs-literal`: indaco and the base declared the same Night Owl hex, so the pair never
registered as a crossing in either direction. Values carrying `var()` are excluded, because the
browser resolves them before `getPropertyValue` returns and the comparison then reports a
phantom third answer.

Mutation-checked: reverting the concat fails the test and names six tokens plus the cause.

## 7a. The demo deck

`examples/palette-cascade-flip.md` (+ its committed PDF) is the per-feature deck, seven
slides, one per token family this change activates: the syntax ramp on a `code` panel, the
status trio on a `checklist`, the `--diagram-*` state family on a `gantt`, and the own-hue
bands on a `redline`. It is the artifact a reviewer can re-render at any palette —
`node lattice-emulator.js examples/palette-cascade-flip.md out.pdf -p cuoio` — and see that
palette's own curated values rather than the engine's. It cannot show the BEFORE, because a
deck renders in one cascade order; that is what the contact sheet in the PR is for.

## 8. What this does NOT fix

- **base's own status trio is still collapsed** (0.0580 light / 0.0033 dark under
  achromatopsia, `--warn` and `--fail` the same gray) — §5. It renders only on an un-themed
  deck now, which lowers the stakes without removing them; after #1789 that was already true
  of the export path, and this flip does not change it either way.
- **`concrete`'s dark `--fail`** is sub-AA on three composed surfaces (3.91–4.35:1), frozen in
  `KNOWN_SUB_THRESHOLD`. Pre-existing, revealed rather than caused, quantified in §5.
- **`carbone`'s light arm** is still sub-AA on its status inks. Carried from #1801, unchanged.
- **#1685** — the a11y palettes' `--chart-state-*` and `--diagram-critical` are FLAT where the
  trio is a `light-dark()` pair. The flip means those flat values now PAINT on the export path
  too, so the defect got one surface wider without getting deeper. Still argued to be decided
  with #1615.
- **`PROBE` still does not hit-test glyphs.** #1789's per-fragment fix narrows inline boxes; a
  box that genuinely contains a run's center but paints only *around* it is still counted, and
  the tool still does not build real stacking contexts. Both remain named approximations in
  its docblock, and both fail toward a backdrop closer to the truth than the section canvas.
- **The runs still under their floor** are a real population, not an artifact —
  overwhelmingly the `kanban` inline-code chip in dark mode, plus `concrete-dark`'s redline
  `<del>`. Status ink on a tint of itself, tracked as its own slice (#1698).
- **The journey actor dot has no correctly-paired ink**, only a palette whose `--on-accent`
  now happens to clear on its own marks — §5b. The per-slot on-mark tier is the fix and is
  not in this change.
- **The `stamp` variants are absent from `SURFACES`** (`tools/composed-contrast.js`), so the
  composed gate cannot see an ink on `--stamp-color` at all. That is the gate gap behind §5b's
  second member, it is pre-existing, and adding a surface means re-deriving the palette arms
  solved through it — its own change. Same for the `journey` actor dot.
- **`carbone` at `color-mode: light`** renders a styled deck with a 2.60:1 stamp — §5b. The
  palette declares `modes: ["dark"]`, so this is an unsupported configuration, and nothing in
  the engine refuses it. The 2026-08-11 sign-off logged the same gap from the other side (a
  light-only palette forced to `color-mode: dark`); it is still open and still unowned.
- **PPTX and the HTML player were not swept.** Both consume the same bundle and the same
  `${css}`, so the same activation applies, and the `--player` arm of
  `style-sink-breakout.test.js` exercises that path — but no before/after render comparison was
  made for either. **UNVERIFIED**, carried forward from the sign-off package unchanged.
- **The ten-slide deck is not the whole gallery.** It exercises every token family the token
  measurement identified; a component reading an activated token that this deck does not use
  would not appear in the render figures. The token-level measurement in §3 IS exhaustive.
