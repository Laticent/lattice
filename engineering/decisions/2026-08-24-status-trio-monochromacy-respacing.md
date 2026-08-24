---
status: shipped
summary: >
  #1776 added the achromatopsia arm and deliberately re-tuned nothing, leaving a measured
  finding it could not act on: 162 of the 192 committed status-trio pairs sat under the 0.11
  floor `a11y-achromatopsia` was built to reach, worst `concrete`/light where `--pass` and
  `--warn` render the IDENTICAL gray. This is the re-tune, taken deliberately rather than as
  an exceed-only ratchet at today's worst. Under a monochromacy only lightness survives, and
  WCAG contrast is a function of the same luminance — so "three signals mutually >= 0.11" is
  exactly "three distinct WEIGHTS against the canvas", and the solve is one-dimensional. All
  192 pairs clear it now, worst 0.1173, and moving the inks AWAY from their canvas moved 38
  composed pairs out of `KNOWN_SUB_THRESHOLD` outright with 53 more ratcheted up (108 entries
  -> 70). Constrained by the gates themselves rather than by models of them: a first cut that
  modeled AA by hand shipped 110 NEW sub-threshold composed pairs, and a second eroded cuoio's
  pass^fail under PROTANOPIA from 0.1318 to 0.0516 — the #1704 shape in reverse. Two palettes
  pay a visible price the arithmetic forces (cuoio and concrete take a near-black `--pass` in
  light mode). Three separate defects fell out of the same predicate along the way: the
  derivation emitted `--text-muted` LOUDER than `--text-body` on all four starters in dark
  mode, `checkMutedTierFloors` measured only one of the two quiet tiers, and cuoio's
  `--text-label` had drifted onto the body ink with AA green throughout.
builds-on: 2026-08-23-measurement-primitives-reach-the-reader.md
---

# Three signals need three weights, not three hues

**2026-08-24 · branch `claude/measurement-primitives-followup-vkpqab`**

**Area:** `themes/*.css`, `lib/theme/derive.js`, `lib/components/chart/_chart-family/`,
`tools/check-ownership.js`, `tools/bless-palette-baselines.js`, `tools/cvd-audit.js`

## 1. What #1776 left on the table, and the fork

#1776 wired the achromatopsia primitive into the CLI a human runs and reported what it
found: **31 of 32 palettes have a `--pass`/`--warn`/`--fail` pair that collapses under
achromatopsia**, worst ΔE 0.0032. It re-tuned nothing, by design — "re-tuning a palette is
a palette change with its own sign-off" — and named the ratchet as the obvious next pass.

That next pass had a real fork, and it was put to the human with numbers:

| | green today? | what it costs |
|---|---|---|
| **A** — freeze at today's values, exceed-only | yes | 162 pairs frozen where a monochromat cannot read them; the constraint on a pair at 0.0032 is "do not fall below 0.0012", which is not a constraint |
| **B** — enforce 0.11 now | no — 162 red | the status trio of 31 palettes moves |

**B was chosen.** This note is B.

The honest case for A is that it closes the #1704 hole (a re-tune collapsing a distant
palette through a shared channel) without moving a pixel, and the honest case against it is
that it puts a blessed number on the status quo and green CI over `concrete`'s two
identical grays. The case against B was that it is catalog-wide visual work colliding with
three frozen tables at once. It turned out to be that, and also to be a net contrast WIN
(§4) — which nobody predicted and which is the most useful thing in this note.

## 2. The solve is one-dimensional, and that is the whole idea

Under a monochromacy only lightness survives. WCAG contrast is *also* a pure function of
relative luminance. So these two sentences describe the same axis:

> the trio is mutually ≥ 0.11 in OKLab under achromatopsia

> the three signals carry three distinct WEIGHTS against the canvas

That collapses what looks like a colour problem into a one-dimensional placement problem:
**choose three weights, then move each ink's OKLCh lightness — hue held, chroma yielding
only where the sRGB gamut clips — until its simulated gray lands on its target.** Three
tokens mutually ≥ 0.11 need 0.22 of lightness range, which is why the crowded groups
(twelve categorical fills, eight chart hues) take the audit's lower 0.065 and this group
does not (#1776 §3.1).

### 2.1 What is searched

All six ORDERS × every placement on a 0.01 weight grid, scored by movement **plus lost
chroma**. Both halves of that earned their place:

- **Order.** Preserving today's rank is the obvious default and it is not always
  available. `cuoio`'s `--fail` is boxed into `[0.38, 0.48]` — `obligation-matrix/heat-fail`
  paints text on a tint OF the token, so darkening the ink darkens the tint under the text —
  and no placement preserves its current order. Where a trio is *under* the floor its
  current rank is not information: `atelier`'s `--warn` and `--pass` sit 0.0032 apart, a
  rank that means nothing because the two are indistinguishable.
- **Chroma.** A placement that satisfies every constraint by driving `--pass` to `#000f03`
  is feasible and worthless — the gamut collapses chroma at that lightness and a "pass" that
  renders as black is not a green. An early cut, scored on movement alone, did exactly that.

### 2.2 What constrains it — the gates, not models of them

This is the part worth carrying forward. **Every constraint is evaluated by running the
real gate**, and each time a constraint was *modeled* instead, the model was wrong:

| oracle | what a modeled version missed |
|---|---|
| `evalSurface` over the real `SURFACES` table | a hand-written "AA on `--bg` and `--bg-alt`" shipped **110 NEW sub-threshold composed pairs** — a status ink is read on its own 10–18% tint over a card, and that composite is what the gate scores |
| the chart family's derived state fill vs `--text-heading` | not a composed SURFACE at all, so the oracle above cannot see it; six palettes went red |
| every DICHROMACY floor in the committed `CVD_FROZEN` | moving lightness moves chroma with it where the gamut clips, and a cut took cuoio's `pass^fail` under **protanopia** from 0.1318 to 0.0516 |

The third is the #1704 shape in reverse — a re-tune satisfying its own condition and
breaking a distant one — arriving from the direction the gate was written to watch. It is a
constraint on the solve now, not something to discover afterwards.

## 3. The engine change, and why it is not scope creep

`--state-{pass,warn,fail}-fill` mixed the status hue **58%** into black on a dark canvas.
The lightest respaced hues took burgundy's `--pass` fill to **4.47:1** against
`--text-heading` — under the bar `chart-contrast.test.js` holds it to.

The 58% was calibrated when the trio sat in a narrow mid band, **and the comment beside it
said so**: "~58% keeps it rich but dark enough for white text." The number was a function of
the hues; the hues moved. It is 50% now, which clears every shipped hue with margin and
takes every OTHER state fill *further* from the bar, never closer. The alternative —
unwiring `--chart-state-*` from the trio on the palettes where it binds — was rejected: it
would freeze those chart hues in the collapsed state the trio just left, unmeasured.

The four a11y palettes pin `--chart-state-*` to literal copies of their trio; those were
re-synced, along with `--diagram-critical`. `carbone`, `carta`, `indaco`, `onyx` and
`concrete` curate theirs independently and keep them — with the comments that claimed
equality ("dark-side of `--pass`", "`--pass` already equals `--chart-state-pass`") corrected
rather than left to read as still true.

## 4. What it actually cost, and what it bought

**Bought.** Moving every status ink AWAY from its canvas moved its composed readings with
it. `KNOWN_SUB_THRESHOLD` — the frozen list of composed pairs below their bar — goes from
**108 entries to 70**: 38 pairs cleared outright, 53 ratcheted up, none worse.
`carbone`'s light arm, sub-AA before and still sub-AA (a pre-existing defect this change
does not own, HARD RULE #18), improved on all three: 2.82→3.39, 3.35→5.44, 1.98→2.03.

**Paid.** Two palettes take a near-black `--pass` in light mode — `cuoio` `#000f03` and
`concrete` `#002d07` — and the arithmetic forces both:

- `concrete`'s canvas is a mid-gray `#B8B8B5`, so AA caps every status ink at weight 0.40
  and 0.22 of span has to fit underneath it.
- `cuoio` is worse, and instructively so. Its `--warn` and `--fail` are boxed from below by
  the `obligation-matrix` heat surfaces, and its `warn^fail` under protanopia is frozen at
  0.1527 — above the collapse floor, so it must stay above it. That forces warn and fail
  apart, which leaves only the bottom of the window for `--pass`. Trading it away was
  considered and refused: protanopia is orders of magnitude more common than achromatopsia,
  and the frozen value is a floor a real reader is standing on.

Rendered and looked at (§6): both still read as dark green rather than as black, because
the components that carry them paint on a pale tint of the same token. It is the honest
price of the choice, and it is named here rather than left for a reviewer to find.

## 5. Three more defects, same predicate

Once "measure an ink against another INK, with no canvas in it" is the tool in hand, it
finds things a contrast floor structurally cannot. All three of these had AA green
throughout.

### 5.1 The derivation emitted a de-emphasis tier LOUDER than body

`--text-body` / `--text-secondary` / `--text-muted` are one ordered contract.
`design/theming.md` says muted is "Still quieter than `--text-secondary`", which only means
anything if secondary is quieter than body in turn. Solving each tier independently against
the canvas broke it two ways, and **only one was visible to a separation predicate**:

- **LIGHT — convergence.** `solveInk` walked the author's pale muted seed down to the AA
  floor while `ensureContrast` walked a body/muted mix down to the same floor, so they met.
  `dusk` — the Studio's default starter — emitted the two BYTE-IDENTICAL at `#646c7a`.
  (Logged by #1776 §5; this is the fix.)
- **DARK — inversion, which no ΔE row can see**, because the two ARE far apart. The dark
  muted lifted the LIGHT-mode seed toward white, and against a near-black canvas that is the
  **loudest ink in the ramp**: dusk's muted read **10.30:1** where body read 7.46:1, on all
  four starters. Not in #1776's log, and not findable by the row it was reasoning about —
  found by asking a different question (order, not distance) of the same four themes.

Both tiers are derived FROM the ladder now: muted is the author's seed where it clears AA
*and* is already quieter than body, else the quietest ink the canvas admits; secondary is
placed between body and muted. `mix` is monotone in OKLab L and contrast is monotone in
luminance on one side of a surface, so an ink between two AA-clearing inks clears AA — the
repair pass survives only as a fallback for a straddling canvas (`bg` light, `bg-alt` dark).

The test asserts the **order**, on the worst-of-both-surfaces reading the gates use. A
distance test would have passed the dark arm, which is the whole lesson.

### 5.2 The build gate measured one of the two quiet tiers

`checkMutedTierFloors` carried the ceiling for `--text-muted` alone. `--text-secondary` has
the same contract, is repaired against the same two surfaces a few lines apart in
`derive.js`, and its committed worst (0.0384, cuoio/light) is **0.0004** from muted's. #1776
gave the STUDIO meter that row and left the build-time gate without it — so the two surfaces
measuring the same contract disagreed about which tokens it covers. It has the row now.

### 5.3 cuoio's `--text-label` had drifted onto the body ink

Light label `#6F604F` against body `#6b5d4f`: **dL 0.0109, da −0.0002, db 0.0045**. Not a
hue distinction narrowed — no hue distinction at all, 0.0118 from body and 0.0638 from the
saddle gold it exists to carry. The dark arm was a pale tan at chroma 0.026 against the
accent's 0.122. Both arms are the accent now (5.47:1 / 7.05:1, no repair needed), and
`checkMutedTierFloors` gained a third row so it cannot drift back. Committed worst after:
0.0355 (brina/dark).

`--text-label` is EMPHASIS, not a quiet tier, so the row is deliberately outside the loop
that holds the other two — but the predicate is identical, and AA against the canvas is
blind to it in exactly the same way.

## 6. Verification (HARD RULE #23)

- **Rendered, and looked at.** Six status-bearing gallery slides (kpi, obligation-matrix,
  redline, checklist, policy-recommendation, pricing) rendered through the real emulator at
  `cuoio`, `concrete`, `ardesia`, `atelier` and `concrete-dark`, before and after, at 4k.
  The redline `<ins>`/`<del>` and the checklist/matrix state marks are the surfaces that
  carry the trio directly; both read correctly. A per-palette before/after swatch sheet
  covers all 18 source palettes × both modes — the two near-black `--pass` cells in §4 are
  visible in it, and every other cell holds its hue.
- **The label fix, rendered:** `list-tabular`'s meta column goes from a muddy brown-grey to
  a legible gold. That is the whole point of the tier and it was not doing it.
- **Every new check bitten.** The `--text-secondary` and `--text-label` gate rows each fail
  when their token is collapsed onto `--text-body`, over a mutated copy of the WHOLE corpus
  (a one-file fixture trips the gate's own empty-scan guard and would pass for the wrong
  reason), and the failure must NAME the tier — an aggregate count would let a row be
  dropped again silently. An unmutated copy is checked clean through the same path. The
  ladder test was run against the reverted `derive.js` and goes red.
- **A test that could no longer bite was rebuilt rather than left green.** `cvd-audit`'s
  per-group floor was witnessed by ardesia's own collapsed trio; with the tree fixed, no
  committed pair sits in the `[0.065, 0.11)` band that separates the trio floor from the
  crowded-group one, so the test passed under EITHER floor. `cvd-audit.js` gained
  `--themes-dir` and the test now builds a synthetic witness (three hues 0.166–0.237 apart to
  normal vision whose weights sit 0.0795 apart) that is flagged at 0.11 and invisible at
  0.065.
- **An assertion that passed for the wrong reason, fixed:** `/68 entries/` was matching the
  CVD table's `768 entries` as a substring, so the contrast-table pin read the wrong line and
  would have kept passing whatever that table said. Both are anchored to their labels now.
- `npm run lint`, `npm test` (7036), `npm run build`, `npm run build:check`: green.
- **The deployed-preview caveat in #1776's body is false, and the correction is now durable.**
  Chromium here does not inherit the agent proxy, so it cannot reach an external host — but
  Node can, so a loopback reverse proxy renders the real deployed bytes with Chromium
  speaking only to `127.0.0.1`. Verified in this sandbox against a live page and written into
  `engineering/development.md` with the code.

## 7. What this does NOT fix

- **`muted^secondary` is still not a Studio meter row, and the reason CHANGED.** #1776
  rejected it because the derivation collapsed the pair on all four starters. That is fixed
  (0.052–0.083 on the starters now). What is left is hand-authored: **29 of 64 committed
  palette-modes** still sit under the floor, so the row would be red the moment a Studio
  author picked one of those palettes as a base — the same "red before the author touches
  anything" objection, arriving from the catalog instead of from the producer. Adding it is
  palette work, not meter work.
- **`carbone`'s light arm is still sub-AA** on its status inks (2.03–5.44:1 worst-case). It
  improved on all three, it was sub-AA before this change, and forcing it into compliance is
  a `carbone` re-tune off this change's path (HARD RULE #18).
- **The `--strict` reading on the a11y dichromacy palettes** (#1776 §3.4). Unchanged.
- **A "byte-identical under simulation whatever `dn` says" arm** — carried forward from
  #1776 §5 and now **moot for this group**: no trio pair on any palette is byte-identical
  under any of the four conditions. `concrete`'s `#464646` pair was the only instance and it
  is separated. The gap is still real for the crowded groups (66 byte-identical flagged pairs
  in the categorical and chart families), so the arm is still worth writing — it just has no
  witness left in the group that motivated it.
- **`roadmap.styles.css:356`** — `--state-color` paints TEXT while `lib/tokens/contracts.js`
  sanctions it as GRAPHICAL at 3:1. Pre-existing, logged in #1715 §9 and #1776 §5, off-path,
  still logged.
- **The `integration` job has no `timeout-minutes`** in `.github/workflows/ci.yml`, so an
  infra stall costs 6h instead of failing fast. Real, off-path, still recorded.
- **#1685 — the a11y palettes' `--chart-state-*` and `--diagram-critical` are FLAT** where
  the trio is a `light-dark()` pair, so they paint a light-tuned value on a dark slide. This
  change TOUCHES those tokens and does not fix it: they were literal copies of the OLD light
  arms, and they are literal copies of the NEW light arms now. The defect is the flatness,
  not the value, and #1685 argues it should be decided together with #1615 — so re-pointing
  them keeps the family as consistent as it was and leaves the fork open, rather than
  answering it in a diff about something else (HARD RULE #18).
- **#1527's base/theme concat-order flip.** Untouched; the a11y palettes' comments about
  their arms being inert on the EXPORT path until it lands are still accurate.
