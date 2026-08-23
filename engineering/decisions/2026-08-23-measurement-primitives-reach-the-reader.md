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
  the achromatopsia arm with a per-condition AND per-group collapse floor. Only lightness
  survives a monochromacy, so a CROWDED group cannot reach 0.15 — twelve tokens mutually apart
  need 1.65 of lightness range — and those take 0.065; a THREE-token status trio needs 0.30 and
  `a11y-achromatopsia` reaches it, so the trio keeps 0.11. An inversion pass caught the first cut
  applying the reduction on condition alone, which waved 29 status pairs through at 1.29:1 to
  1.86:1 including ardesia's green-vs-red at 1.36:1 — the exact defect the arm was added to find,
  certified clean by the arm. The
  normal-vision half of the induced test keeps 0.15 for every condition, and that asymmetry is
  measured too: lowering it as well adds 996 pairs a sighted reader already cannot separate.
  The new arm finds a status-trio collapse on 31 of 32 palettes, worst ΔE 0.003, and the only
  palette with no induced collapse anywhere is `a11y-achromatopsia`. No palette value was
  re-tuned. A checker caught the first cut of this note misreading the tool's own report — the
  ΔE a group line leads with is the group MINIMUM, not the flagged pair's — so the report now
  names the worst induced pair beside the count.
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

The five hand-built sets, recorded so the table above can be re-derived — each is the ten
ESSENTIAL_KEYS, varying only what is named:

| set | shape |
|---|---|
| `cruel` | `bg #FFFFFF`, `bgAlt #111111`, body `#333333`, muted `#BBBBBB` — MINE. It borrows only the light/dark canvas straddle from `theme-derive.test.js`'s `cruel`; that set keeps Dusk's own inks and overrides the accents, so this row is not quoting it |
| `cuoio-like` | low-contrast warm on cream: `bg #F7F1E6`, `bgAlt #EFE6D6`, body `#6B5D4F`, muted `#A69882` |
| `flat` | body and muted the SAME ink (`#595959`) — an author supplying one value twice |
| `near-ceiling` | body just clears AA (`#767676` on `#FFFFFF`/`#FAFAFA`), muted far too pale (`#DDDDDD`) |
| `dark-first` | `bg #12141A`, `bgAlt #1C1F27`, body `#C7CCD6`, muted `#7C838F` |

`near-ceiling` and `flat` both produce a byte-identical `secondary^body`; `cuoio-like` and
`flat` collapse `muted^body`; `dark-first` collapses `secondary^body` on the dark canvas only —
which is what the meter's worst-wins reduction had to be fixed to surface (§2.4).

`secondary^body` earns its row: it is the same contract ("quieter than body"), AA-repaired
against both canvases a few lines up in `derive.js` — by `ensureContrast(…, 'darken')` where
muted uses `solveInk`, different mechanisms converging onto body the same way — with a
committed worst 0.0003 from muted's — and the derivation collapses it *harder*. Nothing in the repo measured it anywhere.

The three rejections are the part worth keeping. `muted^secondary` is 0.0000–0.0049 on every
starter the Studio ships, because `secondaryLight` is a mix of body toward muted and then
repaired to the same floor muted is — the two tiers land on one value BY CONSTRUCTION. A row
there would fire on everything and teach authors to ignore the panel. `muted-mark^muted` is
0.0000 on 18 committed palette-modes because the AUTHOR wrote the two identical — onyx and the
four a11y palettes importing it, cuoio/dark, magnolia/dark, and the `-dark` twins. (A
fact-checker caught an earlier draft crediting `derive.js` for this: committed palettes are
hand-authored and never pass through `deriveTheme`. The derivation reaches the same place for a
DERIVED theme, which is a separate fact and not the one the 18 demonstrate.) `--text-label` is accent-hued: it is
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

A separation row renders `ΔE 0.007` and an `OK`/`FAIL` grade. Left alone it would have rendered
a bare `—` — the old cell short-circuits on a null ratio — beside an **`AA` badge**, because
`tierOf(null, true)` returns `'AA'`: a WCAG conformance claim for a measurement WCAG does not
define. The dash was harmless; the badge was the lie.

## 3. Part 2 — `tools/cvd-audit.js` gained the monochromacy

The audit loops `SIMULATED_TYPES` now. **`CVD_TYPES` is untouched** — it is the three Machado
matrices, achromatopsia is a monochromacy and has no matrix, and `theme-cvd.test.js` pins the
list at exactly three. `cvd-audit-achromatopsia.test.js` re-asserts that from the other side,
so "make the audit see it" can never be satisfied by pushing the monochromacy into that list.

### 3.1 The collapse floor is per-condition AND per-group

0.15 is calibrated for a dichromacy, where lightness plus one chromatic axis survive. Under a
monochromacy only lightness survives.

**The reduction is about how CROWDED the group is, not about the condition** — and getting that
wrong is how the first cut shipped a green tick over green-vs-red. N tokens mutually ≥ F on one
axis need (N−1)·F of lightness range:

| group | tokens | range needed at 0.15 | reachable? |
|---|---|---|---|
| categorical fills / marks | 12 | 1.65 | no — L spans 0..1 |
| chart spectrum | 8 | 1.05 | no |
| **semantic signals** | **3** | **0.30** | **yes — `a11y-achromatopsia` hits 0.1180** |

So the crowded groups take **0.065** and the status trio keeps **0.11**:

| floor (crowded / trio) | induced | groups flagged | palettes all-✗ | palettes w/ trio hit |
|---|---|---|---|---|
| 0.15 / 0.15 | 1229 | 66% | **7 / 32** | 31 / 32 |
| 0.065 / 0.065 *(first cut)* | 711 | 54% | 2 / 32 | **25 / 32** ← under-reports |
| **0.065 / 0.11** *(shipped)* | **731** | **59%** | **2 / 32** | **31 / 32** |
| 0.048 / 0.048 | 604 | 44% | 0 / 32 | 22 / 32 |

For reference the three dichromacy arms flag 48–64% of groups with 2–7 all-✗ palettes. At a flat
0.15 the achromatopsia arm flags more groups than any dichromacy arm (66% against
deuteranopia's 64%) and ties its seven all-✗ palettes, so it ranks nothing; at a flat 0.048 it is
the quietest, under tritanopia. The shipped split sits inside the band **and** loses none of the
trio signal.

### 3.1a Where each of the two numbers comes from

Those counts are the **check**, not the derivation.

**The crowded groups → 0.065, by transposition.** `a11y-achromatopsia` cannot calibrate these:
its cycle is a monotone value ramp, so the simulation is the identity on it and no pair is
*induced* at any floor — it reports zero at 0.15 as readily as at 0.065 and places no upper
bound. So the number borrows the ratio this repo already measured and shipped one tier down:
`checkHljsSeparation` holds the syntax family to 0.11 under a dichromacy and **0.048** under
monochromacy — after measuring both. `0.15 × (0.048 / 0.11) = 0.06545`, i.e. 0.065. The transposition is
legitimate *here specifically* because the hljs family is also a crowded twelve-way set boxed
into a narrow band by an AA requirement, so the crowding the ratio encodes is the crowding these
groups have.

**The status trio → 0.11, measured directly.** No transposition needed, because the palette
built for the condition measures this group: `a11y-achromatopsia`'s trio is `#4d4d4d` /
`#6e6e6e` / `#2e2e2e`, min pairwise **0.1180** under achromatopsia. 0.11 is the ratchet just
under it — exactly the recipe `checkHljsSeparation` used on its own population.

Taking each group's ceiling as its MAX pairwise ΔE — and counting only groups whose best
dichromacy ceiling is itself ≥ 0.15, since a group the dichromacies cannot separate has no
meaningful ratio — the median achromatopsia/dichromacy ceiling ratio is **0.677** for the
categorical and chart groups pooled (n=64) and **0.303** for the semantic trio (n=32).
Unfiltered the first figure is 0.678 at n=84; a fact-checker reproduced that and could not
reproduce 0.677 until the filter was stated, which is this note's fault, not the number's. **0.436 sitting between those two was the tell that one floor could not
serve both populations** — it was in the first cut's own corroborating evidence, and walked
past. (That draft also said 0.644 for the first figure; a checker failed to reproduce it and
0.677 is what re-derives under the stated pooling.)

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

**731 induced collapses across all 32 palettes.** Not nothing.

The reportable part is the semantic trio, the one group whose whole job is to carry meaning:
**31 of 32 palettes have a `--pass`/`--warn`/`--fail` pair that collapses under achromatopsia.**
The worst is `pass^warn` at **ΔE 0.0032** on ardesia-dark, brina-dark and laguna-dark;
`concrete`'s `pass^fail` sits at 0.0038 (`#464646` against `#454545`). `a11y-achromatopsia` is
the only palette with zero induced collapses anywhere.

Byte-identical flagged pairs do exist — 66 of them, all in the categorical and chart groups.
ardesia-dark's fills are the sharpest: 38 induced collapses, several at exactly **ΔE 0**, from
pairs a sighted reader separates easily (`cat-1-fill^cat-11-fill` is dn 0.2732).

**A number in this note was wrong before a checker re-derived it, and the fix is in the tool as
well as the prose.** The first cut read `✗ semantic signals ΔE 0.000 … 1 collapsed` on concrete
and reported "pass and fail are the identical gray". They are not: the `0.000` is `minCvd`, the
group MINIMUM over every pair, and on concrete it comes from `pass^warn` — which the tool does
**not** flag, because dn 0.1138 is under the normal-vision half. The flagged pair is `pass^fail`
at 0.0038. The report line now prints `worst <n>` beside the count so the flagged pair's own
reading is on screen, because the ambiguity that produced the error is in the tool's output, not
only in one reader.

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
No npm script or workflow invokes the tool, so no gate changes color. It is not true that
*nothing* depends on its exit code any more, and that is worth stating precisely for whoever
widens `--strict` next: this change's own
`test/unit/palette/cvd-audit-achromatopsia.test.js` spawns the CLI repeatedly and asserts its
exit status on several of those runs, and that file runs under `npm test`, which CI runs. Every
exit-status assertion scopes with `--type`, which is why the default-run widening left them
green. `a11y-tritanopia --strict` already exited 1 on `main` (two
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
- **The panel heading moved, and that is a chrome change.** `WCAG audit / AA verified` became
  `Palette audit / AA + tiers`, because `ok` now folds in a predicate WCAG does not define — a
  palette with clean contrast and a collapsed muted tier rendered `WCAG AUDIT … review`, which
  is a false statement about WCAG. Every reference swept: `Fabricate.tsx`, `fabricate.spec.ts`,
  `studio.controls.test.tsx`. No control's accessible name, role, presence or location changed,
  so `docs/e2e/studio-fixture.ts`'s `CHROME` map is untouched.
- **An inversion pass then attacked the two judgment calls nobody had argued against** — the
  floor and the scope widening — and broke the first one. Its finding is §3.1: the
  reachable-ceiling argument scales with GROUP SIZE, not condition, so applying a twelve-token
  reduction to a three-token trio was wrong, and the residue was a green tick over green-vs-red
  on eight palettes. Reproduced independently before acting: ardesia's trio printed `✓` while
  two of its three pairs cleared the normal-vision half and sat at 1.36:1 and 1.52:1 as grays.
  The floor is per-group now and the report names it on any row measured against a different
  one. The same pass tried four attacks on the `secondary^body` row — scope creep, contract
  mismatch, the shared floor, and a false-positive hunt across 8,000 derived audits — and the
  row survived all four (every case where it fires alone has body and secondary within ~1.1:1),
  so that call ships unchanged.
- **An independent checker re-derived every headline number** rather than taking the note's
  word (HARD RULE #25). It reproduced the §2.2 separation table exactly, the 0.15/0.065/0.048
  induced counts, the dichromacy band, the 996-pair figure, and the a11y readings; it refuted
  the `concrete ΔE 0.000` example and the 0.644 median, both fixed above, and found the CI
  claim in §3.4, the stale line in the #1715 note, and the cap edge in §5. It also drove the
  failing panel at 820px and 390px — renders correctly, no truncation, identical row text.
- `npm run lint`, `npm test` (6987), `npm run build`, `npm run build:check`,
  `cd docs && npm run typecheck`, and the 1564-test Studio vitest suite: green.

## 5. What this does NOT fix

- **The `--strict` reading on the a11y dichromacy palettes.** §3.4. True, reported, not
  silenced, and not a defect in those palettes.
- **31 of 32 palettes collapse their status trio under achromatopsia.** §3.3. Reported, not
  re-tuned — this change adds measurement, and re-tuning a palette is a palette change with its
  own sign-off. `cvd-trio-floor.test.js` freezes the trio under the three dichromacies only and
  `cvd-palette.test.js`'s achromatopsia arm covers only `a11y-achromatopsia`, so nothing gates
  this today. A ratchet over the monochromacy arm is the obvious next pass.
- **A byte-identical status pair the tool stays SILENT about.** `concrete`'s `--pass` and
  `--warn` both render `#464646` under achromatopsia — the same pixel — and the audit does not
  flag them, because `dn` is 0.1138 and the normal-vision half is 0.15. Two meaning-bearing
  signals rendering identically is arguably exactly what this arm exists to find, and the half
  that (correctly, §3.2) keeps out never-distinct pairs hides it. The half is not the place to
  fix that; a "byte-identical under simulation, whatever `dn` says" arm would be, and it is a
  separate pass. Found by a checker, not by the change.
- **A FAILING separation row can be pushed off the meter's six-row cap.** `contrast.js` appends
  separation rows last, so among failures they sort last, so once more than six roles fail they
  are the first dropped — reachable from the Studio's own pickers. The #1457 property still
  holds (a failure is never evicted by a PASSING row, so a red badge over six green checks
  cannot recur) and the panel still shows six real failures; but "the cap can only ever hide a
  passing row", which `audit-meter.ts` claimed in as many words, is false once failures exceed
  the cap. The comment and two test names now say which half is guaranteed. Widening the cap or
  ranking failures across kinds would close it; neither is this change.
- **`deriveTheme` emits `--text-muted` byte-identical to `--text-secondary` on `dusk`,** the
  Studio's default starter, in light mode (both `#646c7a`) — and 0.0000–0.0049 on the other
  three. `design/theming.md:88` says muted is "Still quieter than `--text-secondary`", so this
  is the derivation failing a written contract. `muted^secondary` is still correctly NOT a
  separation row — it would be red before the author touches anything, which measures nothing —
  but the source comment used to call the convergence "BY CONSTRUCTION", dressing a producer
  defect as intent. Reworded; the defect is unfixed and off this change's path.
- **A `label^body` collapse on cuoio that nothing measures.** §2.2 rejects the pair because
  `--text-label` is accent-hued EMPHASIS, not a de-emphasis tier — true, and on palettes with
  chroma to spare it is separated by hue (laguna C 0.084 vs body 0.030). But on cuoio, label
  `#6F604F` and body `#6b5d4f` decompose to dL 0.0109, da −0.0002, db 0.0045: no hue distinction
  at all, and ΔE 0.0638 from the accent it is meant to carry. That tier has collapsed there.
  Rejecting the row stays right; an earlier draft of the source comment claimed hue separation
  was doing the work on the one palette where it is not.
- **`checkMutedTierFloors` still cannot see `--text-secondary`.** This change gave the STUDIO
  meter the row; the build-time gate over `themes/` still measures only the muted tier. The
  committed worst is 0.0384, 0.0003 above muted's, so the gate is one row from
  covering it — but adding a gate row is a `check-ownership.js` change with its own bite tests
  and is not what #1715 §9 asked for.
- **`roadmap.styles.css:356`** — `--state-color` paints TEXT while `lib/tokens/contracts.js`
  sanctions it as GRAPHICAL at 3:1. Pre-existing, logged in #1715 §9, off this change's path
  (HARD RULE #18), still logged.
- **The `integration` job has no `timeout-minutes`** in `.github/workflows/ci.yml`, so an infra
  stall costs 6h instead of failing fast. Real, off-path, recorded here so it stays visible.
