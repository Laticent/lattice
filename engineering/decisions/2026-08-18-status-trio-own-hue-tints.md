---
status: shipped
summary: Seven palettes inked `--warn` on a 10-12% tint OF `--warn`, so the band moved with the value and no canvas-based reading could see it. Re-solved along the OKLab lightness axis, hue kept, all three arms JOINTLY — measured, a warn-only solve crosses the 0.15 CVD collapse floor on four of the seven (brina and laguna `warn^fail` under protanopia, carta and onyx `pass^warn` under tritanopia), so the `--pass`/`--fail` moves are load-bearing rather than ritual. #1704's cheaper lead — cut the band recipe 12% to 8%, touch no hue — is answered and rejected with numbers: it rescues `amend-badge` everywhere but cannot close `kpi/hero-warn-pill` on ardesia, brina or laguna at ANY band, including 0%, where they still sit at 4.44 / 4.41 / 4.39 against a 4.5 bar. A rendered sweep, not the token table, then found a surface the catalog could not see - `kpi.attention` repoints the HERO tile's pill at `--warn` while the tile keeps its `--accent-soft` fill, a third stack worth 29 sub-AA palette-modes and 2 cascade regressions, all green beforehand. The baselines needed a regenerator, and the adversarial pass over it found the tool meant to keep two floors honest could cut one 0.1560 to 0.0940 in silence.
builds-on: 2026-08-17-composed-surface-contrast.md, 2026-08-16-flat-palette-dark-companions.md
---

# The status trios, re-curated against the tints they are painted on

**2026-08-18 · branch `claude/status-trio-curation-1698-rh8sby` · #1698**

**Area:** `themes/*.css`, `tools/composed-contrast.js`, `tools/bless-palette-baselines.js`

## Why this exists

`2026-08-17-composed-surface-contrast.md` (#1704) built the gate that can see a
composed surface, then deliberately froze what it found rather than fixing it:

> Re-curating fifteen palettes' status trios is its own slice (#1698), so the set
> is FROZEN rather than fixed.

This is that slice, for the `--warn`-led palettes. `kpi`'s status pill and
`policy-recommendation`'s stance badge ink `--warn` on a 10–12% tint **of
`--warn`**, so the background moves with the value. `tools/contrast-audit.js`
scores each token against `--bg` / `--bg-alt` and reports these palettes clean
while the composed surface sits at 3.76–4.46:1 against a 4.5 bar.

## The scope, re-derived

The issue's 103-pair table predates #1704 and does not describe the tree. Measured
before planning: **147 of 1536** pairs frozen — 115 trio-bound, 24 the `word-cloud`
sequential ramp (#1697, landed separately as #1724 while this branch was in
flight), 8 the `defer` / default badge on `--text-secondary` / `--accent`, which
are not the status trio and stay frozen.

## Solve the trio jointly — and the number that proves it

The method is #1681's: solve along the **OKLab lightness axis, hue kept, against
the moving band**, smallest step that clears every surface in the catalog. What
#1704 added, and this change confirms from the other side, is that the trio moves
**together**.

On most of these palettes only `--warn` is below its bar, so a warn-only solve is
the obvious cheap answer. It is wrong, and not marginally. Holding `--pass` and
`--fail` at their `main` values and shipping only the new `--warn`:

| palette | pair | deficiency | before | warn-only |
|---|---|---|---|---|
| brina | `warn^fail` | protanopia | 0.1890 | **0.1439** |
| laguna | `warn^fail` | protanopia | 0.1820 | **0.1371** |
| carta | `pass^warn` | tritanopia | 0.1579 | **0.1448** |
| onyx | `pass^warn` | tritanopia | 0.1607 | **0.1490** |

Four of seven cross the 0.15 collapse floor — under PROTANOPIA and TRITANOPIA;
no deuteranopia pair crosses anywhere in this change. Lightness is the only channel
a deficiency preserves, so when the band pulls one arm down the others come with it
or the pair closes. **The `--pass` and `--fail` moves buy no contrast and are not
ritual: they are what keeps the trio DISTINCT under a deficiency** — `distinct`,
not `legible`; `tools/cvd-audit.js` glosses 0.15 as "just about distinct", and a
0.006 gap across that threshold is not the difference between readable and not.

The stronger form of the argument, which this note originally understated: measured
against the gate's BELOW-floor arm as well, warn-only violates on **all seven**
palettes, not four — ardesia `warn^fail`/deuteranopia 0.1228 → 0.0775, indaco
`pass^warn`/protanopia 0.0218 → 0.0035, cuoio `warn^fail`/protanopia 0.1236 →
0.1166. The cheap route is not merely risky; it is illegal under the gate that
already exists.

### Spend at most half the margin

The gate's limits are `>= 0.15` above the collapse floor and `>= frozen - 0.002`
below it. A first cut solved to those exactly and put laguna's `pass^fail` under
protanopia on **0.1500** — the one value `CHANGELOG.md` records as *"chosen so it
still holds the >=0.15 protanopia pass<->fail CVD floor"*. Passing a gate by
0.0000 is not passing it, so the solver now spends at most half the available
headroom.

Stated honestly, because the first draft of this note overstated it: laguna ends
at **0.1524**. That is real headroom against the floor, and it is still *below*
the 0.1534 it started at. The rule buys distance from the cliff, not improvement.

**The rule is a heuristic, not a derivation.** The obvious principled alternative
is to make the CVD rule monotone — delete "separation above the floor is spendable"
and forbid erosion on every frozen pair. **Measured, it is infeasible, so this is a
closed question rather than a TODO:** applied to every pair it produces **37
violations**, across all seven palettes and both `-dark` twins plus `a11y-base` and
`a11y-tritanopia` — that is *every* solve in the change, not "some" — and every one
of the 37 has frozen AND measured above 0.15, so monotone refuses only pairs that
were and remain above the collapse floor. A grid search over ±0.20 OKLab lightness
on all three ardesia arms, hue and chroma kept, **68,921 candidates, produced zero
monotone-feasible solves**. The binding constraint is structural: clearing AA on an
own-hue tint requires darkening a light trio, and uniform darkening compresses every
pairwise distance. Monotone plus hue-kept is a deadlock, not a stricter gate.

## #1704's cheaper lead, answered

#1704 closed with a lead this change owed an answer to:

> one measured lead worth trying first: **dropping the band recipe from 12% to 8%
> cuts the population by roughly half without touching a single hue.**

It is half right, and the half that fails is the half that matters. With `main`'s
hues throughout, varying only the band:

| band | surface | ardesia | brina | carta | cuoio | indaco | laguna | onyx |
|---|---|---|---|---|---|---|---|---|
| 12% | `hero-warn-pill` | 3.82 | 3.80 | 3.92 | 4.40 | 4.00 | 3.76 | 4.11 |
| 8% | `hero-warn-pill` | 4.02 | 3.99 | 4.12 | 4.64 | 4.20 | 3.98 | 4.31 |
| **0%** | `hero-warn-pill` | **4.44** | **4.41** | 4.55 | 5.17 | 4.65 | **4.39** | 4.80 |
| 8% | `amend-badge` | 4.70 | 4.60 | 4.69 | 4.96 | 4.58 | 4.52 | 4.90 |

At 8% the stance badge clears everywhere — the lead is correct about that. But
`kpi/hero-warn-pill` on ardesia, brina and laguna **cannot be rescued at any
band**: remove the tinted band entirely and they still sit at 4.44 / 4.41 / 4.39.
The hue had to move — and once `--warn` moves, the joint rule pulls `--pass` and
`--fail` with it, so thinning would be a second visual change with no remaining
problem to solve. That is the whole reason, and it needs no help: an earlier draft
of this note added "it would change the look of every status surface", which is
backwards by measurement. The route taken moves the INK by ΔE 0.027–0.081; thinning
would move the BAND by 0.014–0.024. The chosen route is the more perceptually
invasive one, and the argument for it is feasibility, not restraint.

## A surface the catalog could not see

The catalog modeled two `kpi` stacks: the warn pill over `--bg-alt`, and the pass
pill over the hero tile's `--accent-soft`. From that pair it looked as though
warn-over-accent-soft was covered. It is not. `.attention` repoints the **hero**
tile's pill at `--warn` while the tile keeps its `--accent-soft` fill
(`kpi.styles.css` — the modifier sets `--pill-*`, `border-left-color` and an
`::after` color, and nothing else), which is a third stack. It renders on
`kpi.gallery.md`.

It was found by **rendering the status galleries in every palette and reading the
result**, not by reading the token table — 72 decks, and one run under the bar
that no gate could report. **A missing surface is the worst failure this gate has:
it does not report a defect, it reports nothing, which reads as a pass.** It was
worth 29 sub-AA palette-modes and 2 cascade regressions.

Two accounting notes for the next reader:

- The rendered tool first reported **4.44:1** for it on ardesia. That is the ink
  on the *tile*, without the pill's own band — a different stack. The composited
  figure that belongs to the entry is **3.82:1**, i.e. worse. An artifact has to
  come from the surface it is cited for (HARD RULE #23), and this one nearly did
  not.
- The 2 regressions are `a11y-achromatopsia` and `a11y-tritanopia` **dark**, whose
  curated status hue scored below base's default there (4.31 and 4.37 against
  4.96). The regression arm has budget 0 and no exemptions, so they are fixed with
  the surface rather than deferred to their own slice.

## The regenerator, and what an adversarial pass found in it

Re-curating a trio moves two committed tables — 110 contrast entries and 576 CVD
distances — that cannot be re-derived by hand. The first cut did it with a scratch
script, which put the safety property somewhere no reviewer could see: the same
defect one level up. `tools/bless-palette-baselines.js` (`npm run palette:bless`)
is that script, in the repo, in the `bless` idiom `bench:bless` and the split
oracle already use.

**Then the adversarial pass (HARD RULE #25) took the tool apart, and it was the
right call.** Every one of these was live on a green tree:

- **A per-bless tolerance compounds.** The tool allowed a one-unit drop so a table
  first written by rounding could be re-written by flooring. Sound once, wrong
  every time after: a value legitimately losing one unit per change walks a
  0.1500 floor to **0.1480** in twenty blesses — exactly the 0.0020 erosion
  tolerance the CVD gate enforces. A floor you can walk through one PR at a time
  is not a floor. The slack is gone; a test pins it across 200 rounds.
- **A loose parse writes floors down in silence.** `readEntries` matched entries
  with a regex, and anything it *missed* was not preserved — an absent key takes
  the measurement unconditionally and is reported as an anonymous count. Legal
  JavaScript it missed: double quotes, `1.5e-1`, `0.15_0`, a different space after
  the comma. Reproduced end to end: a floor cut **0.1560 → 0.0940**, no line
  naming it, both gates green forever after. Parsing is strict and fail-closed now.
- **A comment beat the real entry.** `matchAll` cannot see comments and `new Map`
  is last-wins, so a comment *quoting* an old value — exactly what the tool's own
  header invites ("a manual, argued edit") — overrode it, and the write-down was
  reported as a **ratchet up**.
- **A mid-merge file was resolved silently**, taking the incoming side and erasing
  the conflict markers into valid JavaScript.
- **`npm run palette:bless --dry-run` wrote both tables.** npm does not forward a
  bare flag to argv; it sets `npm_config_dry_run`. The operator asking for a
  preview got a committed rewrite.

The catalog's own evidence pins were inverted in difficulty too — a cosmetic
declaration reorder reddened the gate, while a modifier repainting the hero tile
(which makes the modeled base wrong) passed. Pins are order-insensitive now, plus
a file-scoped absence check in the idiom `NO_GROUP_ALPHA` already establishes.

## What the tables mean now

`CVD_FROZEN` stopped being "today's measurement" the moment blessing began holding
floors. Where a change erodes a pair within tolerance the entry keeps the older,
larger value, so **an entry is an upper bound on the shipped separation, not a
reading of it** — 73 entries are above the tree as of this change. The header says
so now. The direction is strict (the floor never relaxes) but the semantics
changed and a reader has to know.

The honest accounting for this change: **79 distances ratchet up, 73 erode within
tolerance and are held** (largest −0.041, brina `pass^fail` under tritanopia), and
**228** CVD entries move one unit in the last place as pure round-to-floor
re-representation (the contrast table contributes a further 40; an earlier draft
summed the two and reported 268 as if it were CVD alone). The commit that first
reported this said "none is written down", which is true and reads as "nothing
eroded". Both numbers belong together.

**44 of the 73 held entries enforce nothing.** The above-floor arm compares against
the constant 0.15, never against the entry, so for a pair frozen at or above the
floor the stored number's only job is to inform a reader — and it misinforms by up
to 0.041. Only the 29 frozen BELOW the floor are load-bearing, where holding the
older value means the change spent its own erosion budget rather than resetting it.
The dominating fix is one line in `bless()`: hold the high-water only when
`frozen < COLLAPSE`, take the measurement otherwise. Not done here because it
changes the gate's semantics and this change is already wide; recorded so it is a
decision rather than an oversight.

## Found, not fixed

- **`tools/check-slide-contrast.js` double-counts an inline sibling's band.** Its
  underlay heuristic adds a *preceding inline element* when their line boxes
  overlap, so two adjacent `<ins>` runs composite the same band twice — 4.38:1
  reported where the live DOM gives 5.00:1. Reproduces on `main`; not caused or
  worsened here.
- **`kpi`'s `tall` / `strip` families set the hero tile to `background: none`,** so
  the pill there sits on the section canvas rather than `--accent-soft` — a
  pre-existing modeling gap for two families, excluded from the new absence check
  rather than silently swept into it.
- **The 8 `defer` / default badge rows** (`--text-secondary` and `--accent` on
  their own tints) stay frozen. Not the status trio.
- **`--chart-state-*` has no `base.tokens.css` default, and mirroring it was
  reverted.** `chart-family.css:394` reads it as `var(--chart-state-pass, <inline
  fallback>)`, so a palette LITERAL wins in both cascade orders — unlike the trio,
  which base declares and therefore overrides until #1527. carta and indaco carry
  literals; nine other palettes write `--chart-state-pass: var(--pass)`, which
  resolves through the losing token and is inert.

  An early draft of this change mirrored those literals onto the new trio values for
  consistency. **That was the sole cause of a real, measured regression**: single-token
  probes attributed 100% of the render delta to `--chart-state-pass` and 0% to the
  status trio, and it made **six chart gallery goldens** stale (`progress` 121,864 px,
  `gantt` 85,322, `chart` 43,352, `kanban` 4,942, `state-chart` 3,304, `radar` 316)
  plus at least thirteen deck goldens (`examples/portrait-journey` 462,280 px). The
  mirroring bought nothing — no `--chart-state-*` surface is in this gate's catalog and
  none was failing — so it is reverted. Every affected page now renders BYTE-IDENTICAL
  to `origin/main` (verified at fuzz 0, not at tolerance), and carta/indaco's chart
  hues can follow in the #1527 slice, where the trio becomes live on that path anyway.

- **`tools/regression-gate.mjs` cannot see a large-area, low-amplitude fill change,
  and its header says it can.** This is how the above nearly shipped. The gate pairs
  `FUZZ = 3%` (≈8/255 per channel) with `FAIL_FRACTION_MERMAID = 0.01` for the whole
  `chart`/`diagram` bucket — 5,184 px per page. The `--chart-state-pass` move painted
  ~23% of a page at a 2–4 level delta: 121,864 raw pixels collapse to 724 after fuzz,
  against a 5,184 floor. The gate's own comment claims "real unblessed drift is far
  larger (a CSS change moves 10-100% of a page)", which is true of amplitude-heavy
  changes and false of tint changes. Pre-existing and off this change's path, recorded
  rather than widened here.

  **The lesson, stated correctly, because this note first stated it backwards.** An
  earlier draft used the gate's green to refute a bespoke measurement and generalized
  it to "believe the one whose output is a committed artifact". That is wrong and
  would suppress the next true sub-tolerance finding. A tolerance-bearing gate's green
  means "within tolerance", never "identical", and equality-within-tolerance is not
  transitive — golden ≈ A and golden ≈ B does not give A ≈ B. When a bespoke harness
  disagrees with a gate, **reconcile the thresholds before deciding which is wrong.**
  Reuse the existing watcher first (HARD RULE #15), and read its tolerance before
  quoting its verdict.

- **All four a11y palettes ship a sub-AA warn pill in their SHIPPED mode.**
  `kpi/hero-warn-pill` scores 3.86–3.88 on `a11y-achromatopsia`, `-deuteranopia`,
  `-protanopia` and `-tritanopia` in LIGHT, and `a11y-base.css` pins
  `color-scheme: light`, so light is what those palettes render. They are frozen for
  slice 3 along with ten other palette-modes. Worth naming plainly: an author who
  picks an a11y palette *because* they need accessibility gets a 3.88:1 warn pill on
  `kpi.attention`'s hero tile until that slice lands. The two a11y DARK arms were
  fixed here only because the regression arm has budget 0 and no exemptions — the
  gate shaped which seam got fixed, not the severity.
- **`tools/check-slide-contrast.js` double-counts an inline sibling's band.** Its
  underlay heuristic adds a *preceding inline element* when their line boxes
  overlap, so two adjacent `<ins>` runs composite the same band twice — 4.38:1
  reported where the live DOM gives 5.00:1. Reproduces on `main`; not caused or
  worsened here.
- **`kpi`'s `tall` / `strip` families set the hero tile to `background: none`,** so
  the pill there sits on the section canvas rather than `--accent-soft` — a
  pre-existing modeling gap for two families, excluded from the new absence check
  rather than silently swept into it.
- **The 8 `defer` / default badge rows** (`--text-secondary` and `--accent` on
  their own tints) stay frozen. Not the status trio.
- **`--chart-state-*` has no `base.tokens.css` default,** so a palette literal wins
  in *both* cascade orders and is NOT inert on the export path the way the trio is.
  `chart-family.css` reads it as `var(--chart-state-pass, <inline fallback>)`, so
  carta's and indaco's literals are live in every render. Keep this in mind before
  reasoning that a palette change "cannot move a shipped byte" — the trio is inert
  until #1527, and these are not.

  **Measured, they move nothing here, and the way that was settled is the point.**
  An adversarial pass reported this as a shipped defect — `progress.gallery.light.pdf`
  stale by 59,332 px — using its own 50-dpi harness to diff a `main` render against a
  branch render. Checked with `npm run regress`, the repo's OWN committed-artifact
  watcher (#1379), which renders galleries through the real emulator under **indaco**
  — the exact palette whose `--chart-state-pass` moved: 13 of 14 chart galleries
  match their committed goldens on this branch, the fourteenth (`word-cloud`) drifts
  identically on `origin/main` and belongs to #1724, and six sampled carta/indaco
  chart decks carry drift signatures identical to `main`. Committed golden equals
  `main` render equals branch render, so the two renders cannot differ. A bespoke
  harness disagreeing with the gate built for the question is the harness's problem
  (HARD RULE #15): reach for the existing watcher before building a new one, and
  when the two disagree, believe the one whose output is a committed artifact.
