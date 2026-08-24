---
status: shipped
summary: >
  #1808, both halves. `--bless` had no ratchet — it wrote whatever the sweep measured, in
  either direction, so a bless could answer the gate's only question ("did tonight make
  something worse") by recording the worse number as known. It is ratchet-only now, with
  `--allow-loosen` as the single explicit way down, and a held row leaves the nightly RED
  rather than green. The second half was diagnosed wrongly in the issue and the correction
  matters: the two `anima-scene` pause rows are NOT load-sensitive. Re-run in isolation on the
  shipped tree they read 2.55 / 2.56 / 3.78 against a committed 3.20 / 3.19 / 3.20, and the
  values SHUFFLE BETWEEN PAGES run to run. The cause is per-slide, not per-machine: making a
  frame `lp-active` is what starts its scene, and the audit read the control 120ms later while
  its chrome was still fading. Settling page-level animations does nothing; settling inside the
  per-slide loop makes three consecutive runs byte-identical and drops the deck from 6 findings
  to 3 — the three "as exported" rows were the fade caught halfway, not defects.
builds-on: 2026-08-18-inspection-oracle-catalog.md
---

# The player-contrast oracle could not be trusted to bless itself

**2026-08-24 · #1808 · branch `claude/palette-contrast-sweep-osvq2v`**

**Area:** `tools/check-player-contrast.js`, `test/unit/tools/check-player-contrast.test.js`

---

## 1. Why this blocked something

`test/oracle/player-contrast.json` still lists 17 findings that #1789 fixed. Re-blessing is
the obvious move and it was the wrong one to make first: the tool that would do the blessing
had no ratchet and produced numbers that did not reproduce. Blessing under those conditions
would have written a fresh set of unexplained ratios over a stale set of explained ones.

## 2. The ratchet

`--bless` built its map from the sweep and wrote it, whatever the direction of travel. So a
bless could take a row DOWN — recording that a surface got worse and filing it as known. That
is the one edit a baseline must never make on its own, because the nightly's entire question
is whether tonight made something worse, and a bless answers it by moving the goalposts.

`blessRatchet` is a pure function, tested rather than asserted in prose — the shape
`tools/bless-palette-baselines.js` already uses for the palette tables (HARD RULE #15):

- a **new** key takes the measurement;
- a measurement **at or above** the committed value takes the measurement;
- a measurement **below** it is HELD at the committed value, printed with both numbers, and
  counted. The row therefore still compares as WORSE on the next run: the nightly stays red,
  which is the correct state for a finding nobody has explained;
- a key the sweep no longer reports is **dropped** — that is the point of re-blessing, and it
  is counted rather than silent, because a deck that failed to export looks exactly like a
  deck that got better.

`--allow-loosen` is the one way down, and it still prints every row it writes. A loosening is
permitted, never silent.

**No slack, and the asymmetry with `diffBaseline`'s 0.05 band is deliberate.** That band exists
so sub-pixel jitter does not cry wolf. Holding the higher of two numbers a few thousandths
apart costs nothing, because the same band absorbs it on the next comparison — whereas slack
in the ratchet compounds across blesses, and a floor that can be walked down a digit per run
is not a floor.

## 3. The issue's diagnosis of the anima rows was wrong, and the right one is more useful

#1808 records the two `anima-scene` `⏸` rows as reading 3.20 / 3.19 in isolation and
2.56 / 1.93 under a full 139-deck run, and concludes the oracle is **load-sensitive**.

Measured on the shipped tree, that is not what is happening.

| run, `examples/anima-scene.md` ALONE, nothing else on the machine | p3 | p4 | p5 |
|---|---|---|---|
| committed oracle | 3.20 | 3.19 | 3.20 |
| run 1 | 3.78 | 2.55 | 2.56 |
| run 2 | 3.78 | 3.20 | 3.78 |
| run 3 | 4.27 | 2.55 | 3.20 |

Three things follow, and none of them is load:

1. **It reproduces in isolation.** A full sweep is not required to make the number move.
2. **The INK moves, not just the backdrop.** The same glyph reported `rgb(114,131,155)`,
   `rgb(131,145,166)` and `rgb(151,163,180)` on consecutive runs. `PROBE` reads ink from
   computed style, and computed style during a transition is the interpolated value at
   whatever instant the read happened.
3. **The values shuffle between PAGES.** The set `{2.55, 3.20, 3.78, 4.27}` is roughly stable
   while which slide carries which is not — so whatever varies is per-slide state, sampled at
   an arbitrary phase, rather than a global clock or a busy CPU.

**The cause is that making a frame active is what starts its scene.** `auditState` toggles
`lp-active` one frame at a time, and the runtime responds by playing that scene: the play
control flips to `⏸` and its chrome fades to rest over a few hundred milliseconds. The audit
waited a flat 120ms and read.

A busier machine widens the spread, which is why the issue's numbers looked like load. Load is
a symptom of sampling a moving target, not the reason it moves.

### 3a. Two fixes that did not work, kept because they narrow the next one

Recorded because each looked obviously right and cost a round.

- **Settling animations once after `page.goto`.** No effect: at that moment the animation set
  is empty. The transitions this is about have not started yet.
- **Settling repeatedly at page level, with a floor first.** Also no effect, for the same
  reason — the transitions do not belong to page load at all. They belong to the moment a
  particular frame becomes active, which happens later, inside the per-slide loop.

The settle only works where the race is: **inside `auditState`'s per-slide loop**, replacing
the bare 120ms.

### 3b. What settling means here

- **fonts awaited** first — a font swap changes glyph geometry, and the backdrop sample is
  taken from the glyph's box;
- **finite animations finished** — their resting state is the one a reader settles on, and it
  is what the fixed sleep was trying and failing to wait for;
- **infinite ones paused at `currentTime = 0`** — no frame of a loop is more correct than
  another, so the only property worth having is that every run picks the same one;
- **repeated until TWO consecutive quiet rounds, capped at five** — finishing one animation can
  start the next (a staggered entrance, a `transitionend` handler), so a single pass is not a
  fixed point. Two details here were wrong in the first cut and both were caught by an
  independent checker:
  - it returned the count of animations found BEFORE pausing them, which never reaches zero (a
    paused animation and a `fill: forwards` finished one both stay in `getAnimations()`), so the
    loop always ran all five rounds — 812ms per slide instead of 120ms, measured in Chromium, on
    any deck holding an animation. Latent today because no deck in the corpus holds one;
  - fixing that to break on the first quiet round **reintroduced the instability**, and this is
    the interesting part: the player's control fade starts on a delay, so round 0 finds nothing
    running, exits, and the screenshot lands mid-fade again. Three runs went 3 / 2 / 3 findings.
    The always-five-rounds bug had been accidentally load-bearing. One quiet round only says
    nothing is running *now*; the 120ms beat is what gives a delayed transition time to declare
    itself, and a **second** quiet round is what says none did. Four consecutive runs identical
    after that;
  - and hitting the five-round cap now WARNS. The first cut's docblock claimed "the count is
    reported so a deck that never settles is visible" while all three call sites discarded the
    return value — the same silence it was written to prevent;
- the old sleep is **kept, after all of that**, as a floor for work this cannot see (a
  JS-driven layout, a deferred component bake). It is a margin now, not the mechanism.

## 4. What it is worth

Three consecutive isolated runs, after the fix:

```
44 runs across 1 deck(s) · 3 below AA      ← run 1
44 runs across 1 deck(s) · 3 below AA      ← run 2
44 runs across 1 deck(s) · 3 below AA      ← run 3
44 runs across 1 deck(s) · 3 below AA      ← run 4, after the two-quiet-rounds correction
```

Identical rows, identical pages, identical ratios. And the same question asked of a
six-deck sweep (`anima-scene`, `anima-chart`, `gallery-jargon`, `palette-cascade-flip`,
`a11y`, `kanban-chart-redesign`), run three times end to end:

```
2608 runs across 6 deck(s) · 34 below AA      ← sweep 1
2608 runs across 6 deck(s) · 34 below AA      ← sweep 2
2608 runs across 6 deck(s) · 34 below AA      ← sweep 3
```

**Six findings became three** on the deck at issue, and the
three that went away were never findings: the "as exported" rows were the control's fade
caught halfway. The oracle had three phantom entries on this deck.

The three that remain are the dark-scheme rows at exactly `1.00:1`, which are stable and
already understood — they are the pseudo-element MODELLED-backdrop limitation this tool's own
header describes, where a spot audit found the `⏸` scoring 1.00:1 while rendering as light
grey on a dark button and plainly legible. Genuinely fixing those means giving a pseudo-element
a real rect, which is a different change.

## 5. What this does NOT do

- **The baseline is not re-blessed here.** That is the point of the ratchet: blessing records
  ratios, ratios move with every theme change, and this branch changes theme values (the status
  pill's light arm). A ~55-minute sweep blessed on a branch is stale before the branch merges —
  the tool's own header says so. The re-bless is a `main` operation, and it is now safe to
  perform.
- **The full-corpus triple sweep was not run.** #1808 asks for "the tool's summary line across
  three full sweeps, stable". Three sweeps of 139 decks is roughly three hours of wall clock.
  What was run is three isolated runs of the deck the finding is about, plus a six-deck sweep
  repeated three times. Both are stable. **The 139-deck triple sweep is UNVERIFIED**, and it is
  the right thing to do on `main` at the same time as the re-bless.
- **The pseudo-element rows are still modelled, not sampled.** Unchanged by this, and still the
  rows to distrust first.
