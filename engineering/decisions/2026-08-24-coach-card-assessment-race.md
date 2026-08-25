---
status: shipped
summary: >
  The third and last of the docs-suite flake family (#1328 → #1806 → this) is not a clock at
  all. `studio.controls.test.tsx`'s Coach test failed ~1 in 4 on an IDLE box with its own
  explicit 5000ms budget, which no global default could reach — #1831 asked whether the
  deterministic Coach read is genuinely slow or the file has state bleed. Instrumented with a
  60s ceiling, it is neither: the card resolves in **4-14ms** and the file passes 8 of 8 runs
  in isolation and in three full 3315-test runs. What the instrumentation did show is a
  **25-30ms margin** — StudioShell's debounced `assessDeck` round landed at 4141.2ms and the
  chip click at 4168.7ms. The round calls `setFindings` with a FRESH array every time, and a
  housekeeping effect keyed on that array cleared the Coach quick-read card unconditionally.
  Land the round after the click instead of before and the card is inserted and removed inside
  one task, so the `findByText` that follows never sees it — a budget cannot rescue a card that
  has been removed. Fixed at the source: the findings round now clears only the two cards
  COMPUTED from findings (`top`, `weak`), and a `source`-keyed effect clears every card when
  the deck actually moves. This is a real Studio bug, not a test artifact — an author clicking
  a chip inside the 400ms debounce watched the card vanish unprompted. Pinned by
  `studio.coach-card-race.test.tsx`, which hand-releases the round instead of racing it, and
  which fails on pre-fix code with the exact reported error.
---

# The Coach card the assessment behind it deleted

**Closes #1831.**

## The report, and why it looked like a clock

`docs/src/components/studio/studio.controls.test.tsx` — *"the deterministic Coach chips work
with no model connected"* — failed intermittently on an idle box:

```
TestingLibraryElementError: Unable to find an element with the text: /Structure check/i
```

The wait carried its own budget, which is what made the issue worth filing separately:

```js
expect(await screen.findByText(/Structure check/i, undefined, { timeout: 5000 })).toBeInTheDocument();
```

An explicit per-call budget bypasses `asyncUtilTimeout`, so neither #1799's `testTimeout` work
nor #1806's `asyncUtilTimeout` work could reach it. #1831 posed the fork correctly: either the
deterministic Coach read genuinely takes >5s sometimes (a product finding, since the whole
point of that chip is that it computes with no model), or the path is order-dependent on the
rest of the file. It asked for a 60s ceiling before anyone touched the budget.

## What the ceiling actually said: neither

With the wait instrumented at 60s, split into its three legs:

| run | file in isolation | chip appears | click | **card appears** |
|---|---|---|---|---|
| 1-5 | `studio.controls.test.tsx` alone | 48.4-53.4ms | 24.9-101.9ms | **5.2-7.0ms** |
| 1-3 | full `npx vitest run` (3315 tests, 4 workers, 4 cores) | 47.8-49.2ms | 21.0-81.5ms | **3.9-13.7ms** |

Eight runs, 50/50 tests green every time, three of them full-suite. The card resolves three
orders of magnitude inside its budget. So the "slow path" arm is dead, and the "state bleed"
arm has nothing to show for itself either — the file is order-independent, as #1812 left it.

**A wait that never approaches its budget and still fails is not waiting too little. It is
waiting for something that is no longer there.**

## The 27ms

Instrumenting the shell rather than the test — logging every `setCoachCard` — printed the
answer on one line:

```
[INSTR] findings-effect -> setCoachCard(null) @ 3457.5
[INSTR] findings-effect -> setCoachCard(null) @ 4141.2     ← the assessment round lands
[INSTR] runChip(structure) -> setCoachCard   @ 4168.7      ← the chip click, 27.5ms later
```

A second trace, adding a `source`-keyed effect, showed `source` changing exactly once, at
mount — so the second clear is the assessment round and nothing else:

```
[INSTR] findings-effect -> setCoachCard(null) @ 3414.2
[INSTR] source-change                         @ 3414.8  len=1095
[INSTR] findings-effect -> setCoachCard(null) @ 4040.9
[INSTR] runChip(structure) -> setCoachCard    @ 4066.1     ← 25.2ms
```

The test passes because the round happens to land *before* the click. Twenty-five
milliseconds of margin on a machine with four workers on four cores is not a margin.

## The mechanism

`StudioShell` recomputes the deck assessment on a 400ms debounce, asynchronously
(`StudioShell.tsx`, the `assessDeck` effect). Its result goes through `setFindings(a.findings)`
— **a freshly allocated array on every round**, whether or not a single finding changed. A
`useMemo` turns that into `findingKeys`, and a housekeeping effect keyed on `findingKeys` did
three things:

1. stop fix timers for findings that no longer exist,
2. prune `fixStates` entries whose finding is gone,
3. `setCoachCard(null)` — *"the deterministic quick-read card is transient, so it still
   clears."*

(1) and (2) are correctly keyed: they are about findings. (3) is not. Of the five quick reads,
only two are computed from `findings` at all:

| chip | computed from | a fresh findings round makes it stale? |
|---|---|---|
| `top` (`topFixes`) | `findings` | yes |
| `weak` (`weakestSlide`) | `findings` | yes |
| `structure` (`structureCheck`) | `source` | **no** |
| `ask` (`theAsk`) | `source` | **no** |
| `pacing` (`pacing`) | `source` + talk length | **no** |

So a round that reports the same deck it reported before deleted a card it had nothing to say
about. Whether the test sees the card comes down to which of two async chains resolves first —
and they are not independent chains: `assessDeck` and `structureCheck` (via `theAsk`) both
`await core()`, the **same** `import('@/playground/authoring-core.generated.js')` promise, so
their continuations run in the same microtask drain. When the round lands behind the click, the
card is inserted and removed inside one task, the `MutationObserver` callback queries a DOM the
card has already left, and the wait runs out its budget staring at nothing. Five seconds, fifty
seconds — the number was never going to matter.

## Not a test artifact

In the Studio: type, then click a quick read within 400ms, and the card disappears on its own a
few milliseconds after you open it. Nothing on screen explains it. The clear was also *late* in
the ordinary case — it trailed the edit by the debounce, so the card stayed up describing a deck
that had already moved.

## The fix

Two effects, each keyed on what actually invalidates its half:

```js
// the findings round: only the cards computed FROM findings
setCoachCard((c) => (c && FINDINGS_DERIVED_CHIPS.has(c.id) ? null : c));

// the deck moving: every card, at the keystroke
React.useEffect(() => { setCoachCard(null); }, [source]);
```

`source` changes synchronously with the edit, so the card now also clears when the author
expects it to rather than a debounce later — and a chip clicked *after* an edit is no longer
cancelled by that edit's round.

The test's private 5000ms budget goes with it. It was the tell, not the fix: a bare wait on the
suite's considered 3000ms default is now 200x the measured cost, and #1831's objection — that a
per-call budget is unreachable by the suite's own policy — no longer buys anything to offset it.

## Verification

`docs/src/components/studio/studio.coach-card-race.test.tsx` hand-releases the assessment round
instead of racing it, so the timing under test is the test's and not the box's. Three cases:

- a `source`-derived card **survives** a round — fails on pre-fix code with the exact reported
  error, `Unable to find an element with the text: Structure check`;
- a `findings`-derived card **is still cleared** by a round — passes before and after, so the
  narrowing did not quietly delete the staleness contract;
- an edit clears the card at the keystroke — passes before and after.

`npx vitest run src/components/studio/` — 124 files, 1589 tests, green.

## What this family taught, in order

- **#1328** — the outer clock. `testTimeout` at the framework's generic 5s, doing a speed-policing
  job by accident. Fixed by measurement (20s).
- **#1806** — the inner clock. `asyncUtilTimeout` at the library's generic 1000ms, invisible to
  the outer one. Fixed by measurement (3000ms).
- **#1831** — not a clock. A wait deep inside its budget, failing because the thing it waits for
  is deleted behind it.

The generalizable move is the cheap one #1831 asked for and #1806 established: **instrument the
wait with a ceiling far above its budget before touching the budget.** A wait that reports 5ms
and still fails has told you the budget is innocent, which is the entire diagnosis. Reaching for
a bigger number first would have bought a slower red test and left the Studio bug in place.
