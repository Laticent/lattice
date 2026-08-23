---
status: shipped
summary: >
  Two measurement primitives existed and were already used by a build-time gate, while the
  surface a HUMAN reads could not reach either — the direct follow-on #1715 §9 logged as "its
  own change", twice. `lib/theme/contrast.js`, the meter the Theme Studio shows live, had no
  separation concept at all, so `deriveTheme` could emit `--text-muted` byte-identical to
  `--text-body` behind six green rows and an "AA verified" badge; measured, `--text-secondary`
  has the SAME defect and is worse — a near-ceiling essential set makes it byte-identical to
  body while muted merely gets close. Both are now rows of a second KIND, carrying `distance`
  and never `ratio`, folded into the same `results` array the panel renders. Three candidate
  pairs were measured and REJECTED with numbers rather than left unmentioned: muted^secondary
  fires on all four shipped starters, muted-mark^muted is 0.0000 on 18 committed palette-modes
  by design, label^body is a hue distinction and not a tier. And `tools/cvd-audit.js` gained
  the achromatopsia arm with a per-condition collapse floor — 0.065, not the dichromacies'
  0.15, because only lightness survives a monochromacy; reusing 0.15 reports 1229 collapses,
  1.91x the worst dichromacy arm, with seven palettes where every group reads ✗. The
  normal-vision half of the induced test keeps 0.15 for every condition, and that asymmetry is
  measured too: lowering it as well adds 996 pairs a sighted reader already cannot separate.
  The new arm finds a status-trio collapse on 25 of 32 palettes, `concrete` at ΔE 0.000, and
  the only fully clean palette is `a11y-achromatopsia`. No palette value was re-tuned.
builds-on: 2026-08-18-undeclared-color-tokens.md
---

# The measurement existed; the reader could not see it

**2026-08-23 · branch `claude/wire-separation-achromatopsia-ll2nxg`**

**Area:** `lib/theme/contrast.js`, `tools/cvd-audit.js`,
`docs/src/components/studio/audit-meter.ts`, `docs/src/components/studio/Fabricate.tsx`

## 1. The thesis that makes this one change

Both halves are the same defect, and it is not "a gate is missing". It is:

> **the measurement primitive already exists and a build-time gate already uses it, but the
> surface a human actually reads does not.**

A gate the author never sees is not feedback. `checkMutedTierFloors` scans `themes/`; a theme
fabricated in the Studio never joins that population. `checkHljsSeparation` simulates
achromatopsia; the CLI a person runs could not. #1715 §9 logged both, in those words, as "its
own change" and "a separate pass". This is that change.

## 2. Part 1 — the Studio meter had no separation concept

`lib/theme/contrast.js` did not import `oklabDistance` at all. Every row was
`[fill, ink, threshold, role]` through `evalPair`, a WCAG ratio between a canvas and an ink.

### 2.1 The shape problem, and what was chosen

A separation row is a **different predicate**: a floor on perceptual distance between two
INKS, with no canvas in it. It cannot be another `contractPairs()` entry — the tuple would lie
about what is measured, and a ΔE in the `ratio` field would reach every consumer that formats
a ratio.

Two options were on the table: a discriminated row kind inside `results`, or a parallel
`separationPairs()` result list beside it.

**Chosen: a discriminated kind, folded into `results`.** The parallel list is the tidier
shape and it is the wrong one here — `results` is what the Fabricate panel renders, so a
separate list nothing reads would reproduce the exact defect this change exists to fix. The
honesty the tidier shape was buying is bought instead by:

- every row carries `kind: 'contrast' | 'separation'`, so nothing is left for a consumer to
  infer;
- a separation row carries `distance` and holds `ratio` at `null` — no ΔE is ever bolted into
  `ratio`;
- `auditVars` also returns `separation`, a VIEW over the same rows (not a second population,
  so `ok` counts each row once), for a caller that wants the tier alone.

### 2.2 Which pairs — measured, not assumed

Across all 32 committed palettes × both modes, and across `deriveTheme` output for the four
STARTERS plus five hand-built essential sets:

| pair | committed worst | what `deriveTheme` does | verdict |
|---|---|---|---|
| `muted^body` | **0.0380** cuoio/light | 0.0000 when body is at its AA ceiling | **ROW** |
| `secondary^body` | **0.0384** cuoio/light | **byte-identical** to body on a near-ceiling set | **ROW** |
| `muted^secondary` | 0.0021 brina/light | 0.0000–0.0049 on **all four starters**, light | rejected |
| `muted-mark^muted` | 0.0000 on **18** palette-modes | 0.0000 — by design | rejected |
| `label^body` | 0.0118 cuoio/light | — | rejected |

`secondary^body` earns its row: it is the same contract ("quieter than body"), solved by the
same AA repair a few lines up in `derive.js`, with a committed worst four ten-thousandths from
muted's — and the derivation collapses it *harder*. Nothing in the repo measured it anywhere.

The three rejections are the part worth keeping. `muted^secondary` is 0.0000–0.0049 on every
starter the Studio ships, because `secondaryLight` is a mix of body toward muted and then
repaired to the same floor muted is — the two tiers land on one value BY CONSTRUCTION. A row
there would fire on everything and teach authors to ignore the panel. `muted-mark^muted` is
0.0000 on 18 committed palette-modes because `derive.js` deliberately keeps the author's value
for the decoration tier wherever it already clears 3:1. `--text-label` is accent-hued: it is
distinguished by hue, not by a lightness step, and it is not a de-emphasis tier.

### 2.3 Floor discipline

`SEPARATION_FLOOR = 0.030` is a **literal in `contrast.js`**, deliberately not imported from
`check-ownership.js` — a floor that moves with its producer cannot fail for the reason that
matters (#1720 §5). The duplication is made safe by a test that reads
`MUTED_SEPARATION_FLOOR` out of the gate's source text and asserts the two are equal. It reads
the source rather than requiring the module because the gate does not export the constant, and
a pin that fell back to a default when the read failed would pin nothing: an unmatched pattern
is an assertion failure.

### 2.4 A hole the new row kind opened, and closed

`auditMeterRows` reduced two modes to one row with `(r.ratio ?? 99) < (prev.ratio ?? 99)`.
A separation row's ratio is always `null`, so both modes scored 99, `99 < 99` is false, and the
LIGHT reading won by insertion order — a muted tier collapsing only on the dark canvas would
have rendered green. It ranks on **status first, then the row's own magnitude** now, which is
also scale-safe: it never compares a 4.5:1 ratio against a 0.03 ΔE.

The cap-of-6 that ate a failing row in #1457 is unchanged and stayed safe: failures sort first,
so a new PASSING row can only ever evict another passing row. Verified rather than assumed —
the passing separation rows ARE evicted on a clean palette, and the failing ones are not.

### 2.5 The panel

A separation row renders `ΔE 0.007` and an `OK`/`FAIL` grade. It does **not** render
`— : 1` and an `AA` badge, which is what the old code would have produced: `tierOf(null, true)`
returns `'AA'`, i.e. a WCAG conformance claim for a measurement WCAG does not define.

## 3. Part 2 — `tools/cvd-audit.js` gained the monochromacy

The audit loops `SIMULATED_TYPES` now. **`CVD_TYPES` is untouched** — it is the three Machado
matrices, achromatopsia is a monochromacy and has no matrix, and `theme-cvd.test.js` pins the
list at exactly three. `cvd-audit-achromatopsia.test.js` re-asserts that from the other side,
so "make the audit see it" can never be satisfied by pushing the monochromacy into that list.

### 3.1 The collapse floor is per-condition

0.15 is calibrated for a dichromacy, where lightness plus one chromatic axis survive. Under a
monochromacy only lightness survives.

| floor | induced | vs deuteranopia@0.15 | groups flagged | palettes all-✗ |
|---|---|---|---|---|
| 0.15 | 1229 | 1.91× | 66% | **7 / 32** |
| **0.065** | **711** | **1.10×** | **54%** | **2 / 32** |
| 0.048 | 604 | 0.94× | 44% | 0 / 32 |

For reference the three dichromacy arms flag 48–64% of groups with 2–7 all-✗ palettes. At 0.15
the achromatopsia arm is the noisiest on both axes; at 0.048 it is the quietest, under
tritanopia. At 0.065 it sits inside the band.

Those counts are the **check**, not the derivation. 0.065 comes from the ratio this repo has
already measured and shipped for the same question one tier down: `checkHljsSeparation` holds
the syntax family to 0.11 under a dichromacy and **0.048** under monochromacy — 0.436× — after
measuring both. `0.15 × 0.436 = 0.0655`. An independent reading agrees: the median per-group
ratio of the achromatopsia reachable ceiling to the best dichromacy ceiling is 0.644 for the
categorical and chart groups and 0.303 for the semantic trio, and 0.436 sits between them.

**What did NOT calibrate it**, recorded because it is the obvious candidate and it is empty:
`a11y-achromatopsia` reports zero induced collapses at 0.15 as readily as at 0.065, so it
places no upper bound. Its cycle is already achromatic, which makes the simulation the identity
function on it — the palette is unfalsifiable under its own condition by construction. Saying
"the purpose-built palette stays clean" would have been true and worthless.

### 3.2 The normal-vision half keeps 0.15, and that is a measurement

`induced` is `dn >= NORMAL_DISTINCT && dc < collapseFloor(type)`. Only the simulated half took
the per-condition number.

`dn >= 0.15` asks "could a sighted reader tell these apart?" — a property of the palette, with
no simulation in it, so it cannot depend on which condition is being simulated. Lowering it to
0.065 as well adds **996 pairs**, every one with `dn` in [0.065, 0.15): e.g. ardesia
`cat-1-fill^cat-3-fill` at dn 0.0780, a pair of pale L≈87 fills nobody can separate by hue.
Those are what `analyzeGroup`'s own docblock excludes by design and what
`tools/contrast-audit.js` covers instead. The asymmetry is pinned behaviorally — indaco's
categorical fills read ✓ today and would read `✗ … 26 collapsed` if the normal half dropped.

### 3.3 What the new arm finds

**711 induced collapses across all 32 palettes.** Not nothing.

The reportable part is the semantic trio, the one group whose whole job is to carry meaning:
**25 of 32 palettes have a `--pass`/`--warn`/`--fail` pair that collapses under achromatopsia**,
with `concrete` at **ΔE 0.000** — pass and fail are the identical gray. `a11y-achromatopsia` is
the only palette with zero induced collapses anywhere.

`a11y-deuteranopia` and `a11y-protanopia` sit at `pass^fail` ΔE 0.034; `a11y-tritanopia` at
`pass^warn` 0.042. That is **not** a defect in those palettes — a reader with achromatopsia
picks `a11y-achromatopsia`. It is the tool correctly showing that the a11y family is
per-condition rather than universal, which nothing could show before.

Nothing here was re-tuned. This change adds measurement.

### 3.4 A `--strict` behavior change, stated plainly

`--strict` with no `--type` now spans four conditions, so
`node tools/cvd-audit.js a11y-deuteranopia --strict` exits 1 where it exited 0. The reading is
true; the fix is not to look away. `--strict --type <condition>` gates a palette against the
condition it is named for, all four pass that way, and the usage docblock now shows that form.
Nothing in `package.json` or CI runs this tool — it is a diagnostic that exits 0 by default —
so no gate changes color. `a11y-tritanopia --strict` already exited 1 on `main` (two
cross-condition collapses); that is pre-existing and untouched.

## 4. Verification (HARD RULE #23)

- **The Studio meter, on the real Studio.** Built docs site, Playwright/Chromium, the actual
  Fabricate panel: pick `Body ink #767676` and `Muted ink #DDDDDD` on the Dusk base and the
  panel goes from six green rows + "AA verified" to `Muted-Separation ΔE 0.007 FAIL` and
  `Secondary-Separation ΔE 0.000 FAIL` + "review". Pinned as an e2e in `fabricate.spec.ts`,
  which drives the ESSENTIALS group rather than the CONTRACT group — overriding
  `--text-muted` by hand would prove nothing, because the collapse under test is the one the
  DERIVATION manufactures.
- **The CLI, run.** `node tools/cvd-audit.js`, `--type achromatopsia`, the aliases, the bad
  `--type` error, and `--strict` on all four a11y palettes both ways.
- **Every new check bitten before its green was trusted.** Move the meter's floor off the
  gate's → red. Drop the secondary row → red. Let a `color-mix()` through → red. Widen `isHex`
  to 8-digit → red. Revert the meter reduction to ratio-only → red. Reuse 0.15 for
  achromatopsia → red. Lower the normal-vision half → red. Revert the audit to `CVD_TYPES` →
  red.
- **One bite did NOT go red, and the test was rewritten.** The first fail-closed test asserted
  `Number.isFinite(NaN) && NaN >= floor === false` — which re-states JavaScript, not this
  module, and stayed green when the guard was deleted. Behind the `isHex` gate the non-finite
  arm is genuinely UNREACHABLE. The guard is kept as insurance for the day `isHex` widens; the
  test is now a property over hostile values (`#rrggbbaa`, `color-mix()`, a dangling `var()`,
  a number, `null`, `{}`) asserting none becomes a pass and none THROWS — the throw being the
  one that matters, since `normalizeHex` raises and an exception takes out the whole panel
  rather than one row. That version bites both widenings.
- `npm run lint`, `npm test` (6984), `npm run build`, `npm run build:check`,
  `cd docs && npm run typecheck`, and the 1563-test Studio vitest suite: green.

## 5. What this does NOT fix

- **The `--strict` reading on the a11y dichromacy palettes.** §3.4. True, reported, not
  silenced, and not a defect in those palettes.
- **25 of 32 palettes collapse their status trio under achromatopsia.** §3.3. Reported, not
  re-tuned — this change adds measurement, and re-tuning a palette is a palette change with its
  own sign-off. `cvd-trio-floor.test.js` freezes the trio under the three dichromacies only and
  `cvd-palette.test.js`'s achromatopsia arm covers only `a11y-achromatopsia`, so nothing gates
  this today. A ratchet over the monochromacy arm is the obvious next pass.
- **`--text-label` is unmeasured against anything.** §2.2 rejects it as a separation row
  because it is a hue distinction; it does not follow that nothing should measure it. Off-path.
- **`checkMutedTierFloors` still cannot see `--text-secondary`.** This change gave the STUDIO
  meter the row; the build-time gate over `themes/` still measures only the muted tier. The
  committed worst is 0.0384, four ten-thousandths above muted's, so the gate is one row from
  covering it — but adding a gate row is a `check-ownership.js` change with its own bite tests
  and is not what #1715 §9 asked for.
- **`roadmap.styles.css:356`** — `--state-color` paints TEXT while `lib/tokens/contracts.js`
  sanctions it as GRAPHICAL at 3:1. Pre-existing, logged in #1715 §9, off this change's path
  (HARD RULE #18), still logged.
- **The `integration` job has no `timeout-minutes`** in `.github/workflows/ci.yml`, so an infra
  stall costs 6h instead of failing fast. Real, off-path, recorded here so it stays visible.
