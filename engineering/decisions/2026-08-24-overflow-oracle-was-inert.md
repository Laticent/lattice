---
status: shipped
summary: The universal "slide does not overflow its frame" invariant read `scrollHeight > clientHeight` on the `<section>`, which is `overflow-y: hidden`. A clipped box has no scroll extent, so those two numbers are equal BY CONSTRUCTION and the assertion could never fail — for any of the 61 components, for the life of the suite. Proven by mutant rather than argued: `agenda` widened to 24 stops renders a slide the emulator itself reports as `⚠ OVERFLOW — 1 slide exceed the frame and is CLIPPED`, and the suite scored 6/6 on it. The real overflow is one level in, which is what the flex cell-tree made true — a bounded content Cell CONTAINS its spill, so the section never sees it (`.cell-stage` held a 1760px list in a 435px box while the section read 716 === 716). Fixed by measuring through `lib/core/overflow-probe.js`, the existing single source of truth behind the runtime ring, the export warning and autosplit, injected via its own exported `PROBE_SRC` so this gate cannot become a fourth opinion (HARD RULE #1). Verified on TWO frame families, with controls: the agenda mutant (`.cell-stage`, 2041px in 716px) and a split-panel mutant (`.panel-*`, 1397px in 720px) each fail the corrected gate and each PASS the old one, 6/6. The first correct run over the whole corpus is 266/266 — the issue budgeted for real failures and none appeared, which is a finding about the corpus rather than a reason to doubt the fix, because the mutants prove the gate can fail on both frame families.
---

# The overflow gate could not fail

**2026-08-24 · closes #1750**

**Area:** `test/integration/invariants/component-invariants.test.js`

## The assertion, and why it was unreachable

```js
const over = await page.$eval(slideSel(slide), (s) =>
  s.scrollHeight > s.clientHeight + 12 || s.scrollWidth > s.clientWidth + 12);
assert.equal(over, false, 'slide content overflows the 1280×720 frame');
```

The slide `<section>` is `overflow-y: hidden`. A clipped box has no scroll
extent, so `scrollHeight === clientHeight` always. The comparison is not a weak
oracle — it is one whose true branch is unreachable.

## Proven by mutant, not by reading

Widening `agenda`'s manifest sample to 24 stops produces a slide the engine
itself flags:

```
⚠ OVERFLOW — 1 slide exceed the frame and is CLIPPED in this export: page 1.
```

Against that same slide, the suite reported **6 tests, 6 pass, 0 fail**. Both
halves measured independently, on the real surface, before anything was changed.

The reason is one level in, and it is a consequence of the flex cell-tree
(`2026-06-26-frames-as-flex-cell-trees.md`): a bounded content Cell CONTAINS its
overflow. Measured on the mutant, `.cell-stage` was 1098 tall in a 435 box
holding a 1760px `<ol>`, while the section reported 716 === 716.

## The fix is a reuse, not a rewrite

`lib/core/overflow-probe.js` already exists and is already the one source of
truth for this question — the runtime ring, the export warning and autosplit all
read it. It is cell-aware by design, and it exports `PROBE_SRC` (its own function
source) precisely so a `page.evaluate` context can run the identical logic.

Injecting that is what keeps this gate from becoming a fourth opinion about what
overflow means (HARD RULE #1). The failure message now names the cause the kernel
already computes — effective extent, and how many clip cells are spilling.

**Deliberately not fixed by reading the `.overflow` class.** The suite's own
comment rejects that: the sidecar sets it before fonts load, and measuring
post-settle is the entire reason this check lives here.

## Verified on two frame families, each with a control

The mutants matter more than the green run, because a gate that has never fired
earns no trust from passing.

| mutant | corrected gate | OLD gate |
|---|---|---|
| `agenda`, 24 stops (`.cell-stage`) | **FAILS** — 2041px in 716px, 1 clip cell spilling | 6/6 pass |
| `split-panel`, 12 items (`.panel-*`) | **FAILS** — 1397px in 720px, 1 clip cell spilling | 6/6 pass |

Both fail on that component **only**, and the suite returns to green when each
sample is restored. The two cover the distinct clip-cell paths — the standard
frame's body cell and the split frames' panel bodies — so the fix is not
specific to the shape that surfaced it.

## The corpus was already clean, and that is a finding

The issue budgeted for real failures: *"a check that has never been able to fail
has never constrained anything, so components may have been overflowing in the
sample corpus for as long as the suite has existed."*

The first correct run is **266/266**. No sample overflows.

That is worth stating carefully. It is NOT evidence the fix works — the mutants
are. It is evidence about the corpus: whatever kept these samples fitting, it was
not this gate. Read alongside the issue's note that `overflow:check` (the
185-render ratchet that WOULD have caught such drift) is wired to no cadence,
the honest summary is that this surface has been unwatched rather than clean by
enforcement.

## Gates

`npm run lint` · `npm test` · `npm run build:check` ·
`node --test test/integration/invariants/component-invariants.test.js` (266/266).
