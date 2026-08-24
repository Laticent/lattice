---
status: proposed
summary: >
  The scoping this swimlane's largest remaining item needs before anyone writes a solver, with
  every number re-measured on the post-#1807 tree rather than carried from an older note. There
  is NO committed solver — #1801's OKLCh lightness search and the flip note's concrete-specific
  grid search were both throwaways, so the joint re-solve starts by writing one, and the way
  both prior passes did it was to call the real gates as the objective rather than model them.
  The population is smaller and far more lopsided than "66 pairs" suggests: 64 of the 66 frozen
  pairs are trio-driven, and THIRTY of those are `--warn` on two KPI pill surfaces alone, so the
  problem is mostly one token on one component rather than three tokens spread evenly. The
  search space is 18 free trios (not 32 — the 13 `-dark` wrappers and `a11y-base` inherit),
  scored across 64 palette-modes against 25 trio-bearing composed surfaces plus two frozen
  tables and a tier of hard-floor gates. And the one arm already proved INFEASIBLE stays
  infeasible: concrete's dark `--fail` cannot be solved at the current 12% own-hue tint, because
  the band moves with the ink — the escape is a component-level tint cut, which is a visible
  design change and the reason this wants its own branch.
builds-on: 2026-08-24-status-trio-single-root.md, 2026-08-24-status-trio-monochromacy-respacing.md, 2026-08-24-palette-cascade-flip.md
---

# Before anyone writes the joint solver

**2026-08-24 · scoping only — no code, no values changed**

**Status: proposed.** This is the brief for the item
`2026-08-23-status-trio-export-cascade.md` §8 calls "the single largest remaining item in this
swimlane". It was scoped while the cascade work (#1797) and the status pill (#1807) were being
landed, and it is written down rather than carried in someone's head because every number in it
had to be re-measured: the counts in the older notes are stale in both directions.

---

## 1. Why it is not in the PR that scoped it

Three reasons, in order of weight.

1. **It is a different change.** Re-curating the status trio on 18 palettes is a value change to
   every palette's identity. The PR it was scoped in changes where a token is DECLARED and what
   a component's gradient MIXES — neither touches a curated hue. HARD RULE #17 puts those on
   separate branches.
2. **It wants a visual sign-off of its own**, on a rendered gallery at four layouts in both
   modes. Stapling that to a sign-off about status pills asks one reviewer to hold two unrelated
   judgments at once.
3. **One arm is provably infeasible without a component change** (§5), so the work is not "run a
   solver" — it is "run a solver, discover it cannot close, then make a visible design decision
   about concrete's tint". That decision is the human's.

## 2. There is no solver. That is the first task, not a detail

Neither prior pass left one behind:

- #1801's OKLCh lightness search over the trio — a throwaway; its commit adds no script.
- `2026-08-24-palette-cascade-flip.md` §5's grid search over concrete specifically — also a
  throwaway, described in prose.

What both did, and what the next one should do, is **call the real gates as the objective
function rather than model them**. This repo has been bitten repeatedly by a gate whose model of
the page was wrong, and a solver that optimizes against a second model of a model compounds it.
The machinery to call is already exported:

- `tools/composed-contrast.js` — `mergedVars(theme)`, `evalSurface(vars, surface, isDark)`,
  `SURFACES`, `listAllThemes()`, `MODES`, `KNOWN_SUB_THRESHOLD`, `DEGRADE_TOLERANCE`.
- `lib/theme/cvd.js` — `simulate(hex, type)`, `SIMULATED_TYPES` (4 conditions: the three Machado
  dichromacies plus achromatopsia, which is luminance re-encoded as neutral gray rather than a
  matrix).
- `lib/theme/color.js` — `hexToOklch` / `oklchToHex` (which binary-searches chroma down to stay
  in gamut, preserving L and h), `withLightness`, `oklabDistance`, `contrastRatio`, `mix`.
- `lib/core/resolve-token-expr.js` — `resolveTokenExpr`, the engine's own evaluator. Use it; a
  re-implementation is a third model.

The shape that worked for #1807's light-arm sweep, in three steps and about ninety lines: build
the candidate surface as a plain object literal with the parameter interpolated into its `bg`
expression; call `evalSurface(mergedVars(theme), surface, isDark)` for every theme × mode ×
state; keep the worst ratio and the pair that produced it. Then sweep the parameter and read
where the worst crosses the bar. Nothing about that is specific to a gradient stop — the trio's
own surfaces are already in `SURFACES` and can be scored as they stand.

## 3. The population, measured on this tree

`KNOWN_SUB_THRESHOLD` is **66 pairs of 2624**, and it is far more lopsided than the total
suggests:

| frozen pairs | surface | token under pressure |
|---|---|---|
| **16** | `kpi/warn-pill` | `--warn` |
| **14** | `kpi/hero-warn-pill` | `--warn` |
| 11 | `redline/del-on-old-card` | `--fail` |
| 8 | `policy-recommendation/amend-badge` | `--warn` |
| 3 · 3 · 3 | `oppose-badge` · `redline/del` · `redline/old-label` | `--fail` |
| 2 | `policy-recommendation/defer-badge` | `--text-secondary` — **not the trio** |
| 1 each | `checklist/fail-row`, `kpi/hero-pass-pill`, `adopt-badge`, `redline/ins`, `ins-on-new-card`, `new-label` | trio |

**64 of 66 are trio-driven, and 38 of those are `--warn`.** The problem is not "three tokens,
evenly hard". It is mostly one token on two KPI surfaces, then `--fail` on the redline cards.
A solver that treats the three arms symmetrically will spend its search budget in the wrong
place; `--pass` is nearly solved already (2 pairs).

Scale of the search: **18 palettes declare their own trio** — the four `a11y-*` plus the 14 brand
palettes — while 14 inherit (the 13 `-dark` wrappers, which carry byte-identical frozen rows to
their parents, plus `a11y-base`). So **18 free trios, 32 scored palettes, 64 palette-modes**, and
each trio is a `light-dark()` pair, i.e. 6 hexes per palette, 108 free values.

## 4. What has to hold at once

Two frozen tables, both ratchet-only via `npm run palette:bless`, both of which a solve must
re-bless and neither of which may be walked DOWN without a hand edit and a stated reason:

- `KNOWN_SUB_THRESHOLD` — 66 entries, and **25 of `SURFACES`'s 41 entries carry the trio**;
- `CVD_FROZEN` — 768 entries (32 themes × 2 modes × 3 pairs × 4 conditions), with floors
  `0.15` for the dichromacies, `0.11` for achromatopsia, and an erosion tolerance of `0.002`.

Plus a tier of hard-floor gates with no baseline at all, every one of which the trio feeds:
`theme-surface-aa` (trio ≥ 4.5:1 on both `--bg` and `--bg-alt`), `chart-contrast` (the
`--state-*-fill` recipe and `--chart-state-*` vs `--bg`), `cvd-palette` (the a11y four must be
literal `light-dark(#hex,#hex)`, and achromatopsia's trio must be pure gray), `paired-token-parity`,
the docs portal (which THROWS on a trio value that is not 6-digit hex), and
`diagram-ink-contrast`'s `--bg`-on-`--fail` alarm invariant.

**Two component recipes are calibrated against the trio's current lightness and will re-open the
moment it moves**: `--state-*-fill` at 24%/50%, and the `.chart-status` pill gradient — now
18%/30% light and 42%/54% dark, with **both** stops catalogued as of #1807. #1801 had to move the
first, #1809 and #1807 had to move the second. Expect to move them again; they are part of the
solve, not downstream of it.

## 5. The infeasible arm, and the escape

`2026-08-24-palette-cascade-flip.md` §5 established it and nothing here relaxes it: **concrete's
dark arm has no solution.** `redline/del` floors `--fail` at achromatopsia weight ≥ 0.786 while
AA on the composed surfaces floors `--pass` at ~0.79 and `--warn` at ~0.78, against a ceiling of
0.99 — 0.21 of range for three signals that need 0.22 of mutual separation. The single-token
version fails the same way from the other side: the minimum lift that clears 4.5:1 on concrete's
dark `--fail` collapses `warn^fail` under achromatopsia from 0.1203 to 0.0250, straight through
the 0.11 floor.

The reason it is closed is structural, and it is the same one that makes the whole surface hard:
**`--pass-bg` is a tint OF `--pass`**, so the ground moves with the ink and re-tuning buys
nothing. The escape is therefore not a better ink but a shallower tint — cutting concrete's 12%
own-hue mix to ~6% drops `--fail`'s floor to ~0.735 and reopens the range.

That is a **visible change to concrete's redline band and status pills**, and the tint depth is
per-palette today (12% on most, 18% on carbone, 10% on carta / cuoio / indaco; there is no engine
default — `--pass-bg` is palette-only). So the joint solve's real shape is two-dimensional: the
ink AND the tint depth, per palette. Treating the tint as fixed is what made every previous
attempt infeasible.

## 6. Suggested shape

1. Write the solver as a committed tool, not a throwaway — this is the third pass over the same
   ground and the second time the search has had to be rebuilt from prose.
2. Search **(lightness, tint depth)** per palette, not lightness alone. Hue and chroma held.
3. Objective: the real gates. `evalSurface` over the 25 trio-bearing surfaces in both modes, the
   four CVD floors, and the hard-floor tier — as pass/fail constraints, with movement from the
   current value (and lost chroma) as the thing minimized, which is #1801's own criterion.
4. Start with `--warn` and the two KPI pill surfaces. Thirty of the 64 trio-driven pairs are
   there, and it is plausible that a fix to the KPI pill's own recipe — the sibling of the change
   #1807 made to the status pill — clears most of them without moving a curated hue at all.
   **Measure that before solving anything**; the cheapest solve is the one that turns out to be a
   component fix.
5. Only then re-bless both tables, and take the rendered gallery to a human.

## 7. What this note does NOT claim

- **No solve was attempted here.** Every number above is a measurement of the CURRENT tree or a
  citation of a prior note's measurement, labelled as such. Nothing is a prediction of what a
  solve would produce.
- **The `--warn` / KPI-pill lead in §6.4 is a hypothesis, not a finding.** It follows from the
  distribution in §3 and from the fact that the analogous status-pill recipe turned out to be the
  cause rather than the hue — but nobody has looked at `kpi.styles.css`'s pill recipe yet, and it
  may not be the same shape at all.
- **The infeasibility in §5 is carried, not re-derived.** It was measured by
  `2026-08-24-palette-cascade-flip.md` §5 on a tree that predates #1807's pill retune. That
  retune does not touch `--pass-bg`, `redline` or the achromatopsia floor, so it should not have
  moved — but "should not have moved" is exactly the kind of claim this swimlane keeps refuting,
  and a solve should re-derive it as its first act rather than inherit it.
