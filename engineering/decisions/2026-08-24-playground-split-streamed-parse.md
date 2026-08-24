---
status: shipped
summary: >
  `playground-first-paint.spec.ts`'s `@smoke` case failed once in CI — `editorPane was laid out
  2 different ways … [1193 …] [337 …]` — on a PR whose diff cannot reach the Playground, and
  passed on re-run. Filed as #1800 on the hypothesis that the check was flaking. It was
  not: the CI artifact's first content-bearing screencast frame SHOWS the editor pane at full
  width with no preview pane beside it, and the next shows the settled split, so a person
  really did watch it narrow. Cause: the document is STREAMED, and while the parser has
  emitted the editor pane and the 1px separator but not `#pg-split-preview`, a `flex-grow`
  editor is the only child of the row and takes all of it. A 4-core box closes that window
  inside one frame (not reproduced in 12+ local attempts, idle and contended, at throttle 6 and
  20); flushing the same document in two pieces with a stall before the preview panel
  reproduces it every time — 1193px with the preview absent, 337px once it arrives. Fixed by
  RESERVING the absent pane's share — one `:not(:has(> #pg-split-preview))::after` rule, live only
  while the pane is missing — so the layout stays derived from what is present and the two
  `flex-grow` rules are untouched. A first design DECLARED both widths as percentage shares
  instead; it worked and two checkers verified it, but a Munger-inversion pass showed the frame
  was wrong: declaring shares broke Explore (which had been getting full-bleed for free as the
  only growing child), needed a denominator kept in sync across two rules, and carried a residual
  error that scales with the divider width. The shipped rule has none of those — measured 0.00px
  drift at a 1px seam and at 8px. Guarded by a new deterministic `@smoke` case that serves the
  document cut at the preview panel; measured red against `origin/main` at exactly the width CI
  reported, in 4 runs of 4.
---

# The Playground's split assembled in view because the document arrives in pieces

**Closes #1800.**

## The report, and why it looked like a flake

One failure, in the per-PR `studio-smoke` check, on
[a run](https://github.com/SlideWright/lattice/actions/runs/32677209253) whose PR touched no
file that ships into the Playground:

```
Error: editorPane was laid out 2 different ways between first paint and settled —
a person watches it move: [{"t":228,"rect":[0,114,1193,720]},
                          {"t":400,"rect":[0,114,337,720]}]
```

It passed on re-run of the same commit, and #1800 recorded 1 idle + 6 contended local passes
with no root cause. The obvious reading is a sampling race: the spec samples every animation
frame from document start, so it can see layouts that were never composited.

**One correction to the premise first, because it was load-bearing for how urgent this looked.**
#1800's title and body call `studio-smoke` a **blocking** per-PR check. It is not, deliberately:
`ci.yml`'s required `ci` gate needs `lint, unit, integration, docs-build`, and `studio-smoke` is
absent from that list alongside `golden-diff` — it reports and does not gate, pending the nightly
green streak #800 tracks. On the very run this failure comes from, `ci` was green. An independent
checker caught the claim after it had been copied into the first draft of this note and into the
new spec's comment. So no PR was blocked by it; what a flake here costs is the SIGNAL, which is
the argument that survives and is enough.

## It was not a sampling race — the frame is in the artifact

The job artifact carries a trace with a screencast. Its frames around the measured navigation
settle the question without any inference about the sampler:

| trace ms | frame | what it shows |
|---:|---|---|
| 77 453 · 77 544 · 78 034 | byte-identical | the PREVIOUS page — nothing of the new document had painted |
| 78 062 · 78 128 | ~2.9 KB | the new document, blank |
| **78 272** | 28.9 KB | **the editor pane at FULL WIDTH, no preview pane beside it** |
| 78 441 | 45.4 KB | the settled split — a 337px editor and the rendered slide |

The markdown source in the 78 272 frame runs unwrapped across the whole viewport and wraps
inside ~337px in the next one, so this is the pane's real width, not a chrome artifact. The
full-width state was on screen for about 170 ms.

`shellFired` had passed, so the pre-paint replay did run. The seed applied. **The spec was
right, and the assertion it makes is the one it should make.**

## The cause: a streamed document, and a row that is missing a child

Network timings in the same trace show the document arriving at 77 630 and the first
subresource request at 78 009 — a ~380 ms gap on a 2-core runner under the spec's own 6x CPU
throttle. The panes are sized pre-hydration by `playground.css`:

```css
.pg-split > #pg-split-editor  { flex-basis: 0; flex-grow: var(--pg-split-a, 45); }
.pg-split > #pg-split-preview { flex-basis: 0; flex-grow: var(--pg-split-b, 55); }
```

`flex-grow` divides the row between **the children that are there**. HTML parses and paints
incrementally, so there is a window in which the editor pane and the 1px separator exist and
the preview panel does not — and in that window the editor is the only growing child of the
row. 1193 is 1194 minus the separator, which places the parser precisely between the handle and
the preview panel.

### Reproducing it, after 12 attempts that could not

Idle at throttle 6 and 20, and under four-way CPU contention at throttle 6 (six iterations),
the local probe never once saw the editor pane exist without the preview pane: 36 contended
samples, all `337`. The window is real; it is just narrower than a frame on four cores.

So the condition was made deterministic instead of waited for. A ~40-line throwaway HTTP proxy
in front of `astro preview` served the SAME bytes from the SAME origin to the SAME browser,
flushing the response in two pieces with a 600ms stall before `#pg-split-preview` (it lived in
`.scratch/` and is not committed — the guard below supersedes it, and needs no server):

```
before: STALLPROBE settled=337 widths=[1193,337] log=[{"t":55,"w":1193,"pv":false},{"t":556,"w":337,"pv":true}]
after:  STALLPROBE settled=337 widths=[337]      log=[{"t":67,"w":337, "pv":false},{"t":559,"w":337,"pv":true}]
```

`pv` is whether `#pg-split-preview` is in the document. The first line is the CI failure,
on demand.

## The fix: supply the missing child, don't change the algebra

```css
.pg-split:not(:has(> #pg-split-preview))::after {
	content: '';
	flex: var(--pg-split-b, 55) 1 0;
}
```

One rule, live only while the pane is absent. The two `flex-grow` rules above it are
**untouched from `main`**, so the layout stays DERIVED from what is present — the missing child
is simply supplied for as long as it is missing. Measured: 337px with the preview absent and
337px once it arrives (3/3 through a stalled parse), 537/537 on the newcomer path where the CSS
fallbacks are what paint.

`:has()` is sanctioned here: HARD RULE #12 banned exactly this `:not(:has(…))` form in THEME
css and was **retired in place** on 2026-07-10 after an empirical retest. A browser without
`:has()` support degrades to the pre-fix behavior for the parse window — today's defect, not a
new one.

### This is the SECOND design. The first one shipped a worse trade, and an inversion agent caught it.

The first version answered the same defect by DECLARING both widths — a percentage `flex-basis`
share of the container, `flex-grow: 0`. It worked, it was measured, two checkers verified it,
and it was wrong in a way bug-hunting does not surface, because it was correct.

A Munger-inversion pass, asked not "is this right?" but "is this the right frame?", pointed out
that the dilemma was false. The editor takes the whole row not because `flex-grow` is derived
but because **the row is missing a child**. Fix the missing child, and three things follow that
the declared-share version had to pay for:

| | declared shares | reserve the absent pane |
|---|---|---|
| **Explore** | broke it — the preview had been getting full-bleed for free as the only growing child, and a share is a share whether or not the other pane is there. Painted 857 of 1194 and corrected at hydration: the same defect one surface over. Needed a `flex-basis: 100%` override to patch back | **untouched** — the editor is hidden, the preview is the only growing child, it fills the row exactly as before. Verified by deleting the override: 19/19 |
| **the shares** | each rule names BOTH numbers (a denominator pair), so a one-sided edit to `PG_SPLIT_DEFAULTS` leaves a gap the row does not fill, and a third pane needs every rule's denominator updated. The invariant was written down nowhere | each rule names its own number, self-normalizing, exactly as before |
| **the separator** | claims 100% of a container that also holds the seam, so the panes overflow by it and shrink — a residual error that SCALES with the divider: 0.27px at 1px | distributes the row's real free space. Measured **0.00px** at a 1px seam and **0.00px at 8px** — and 8px matters, because a wider touch target on this splitter is a live direction (`2026-08-10-input-verb-parity.md`), and at 8px the declared-share error would have turned the new guard red with the message *"a person watches it narrow"*, blaming the wrong thing |

The inversion pass proposed the rule and measured the first two columns; this note's author
verified all three independently, and added the test the proposal had not run: `:has()`
invalidation across a **streaming** parse rather than a finished cut document. That is the one
way the reservation could have failed — an engine that evaluated `:has()` once and never
re-checked would leave the reserved space in place after the pane arrived. It does not: 337px
before and after, 3/3, plus Explore green with its override deleted.

**Both were correct. The second is smaller, deletes a special case instead of adding one, and
has no residual error.** Recorded rather than quietly swapped, because the lesson is the
process one: two independent checkers verified the first design and neither could have found
this, since neither was asked whether the frame was right.

## The guard

The sampling case stays — it covers every other element. Alongside it, a new `@smoke` case
serves the document **cut** just before the preview panel: the DOM state the parser really
passes through, held still. No sampling, no timing, ~5s.

Measured against the pre-fix stylesheet it reports `editorWidth=1193 settled=337` — the CI
numbers exactly, every run. It is `@smoke` to sit in the same tier as the case it complements
(advisory, per the correction above), trading a probabilistic signal there for a certain one at
~4s of an ~80s tier. It asserts the two widths within a PIXEL rather than equal: the cut page
has no separator to overflow the row, so it is wider by this pane's share of that 1px (337.125
against 336.859), and exact equality would start failing the moment a rounding boundary fell
between them — the flake class this case exists to remove, reintroduced inside the guard.

Neither the assertion nor the tag of the existing case was touched: relaxing that guard was the
one move #1800 ruled out.

## Verified

On the built site (`astro preview` on a production build), real Chromium:

- `playground-first-paint.spec.ts` — **19/19**, including the new guard and the two Explore
  cases that caught the regression.
- `playground-state` · `playground-paint` · `playground-explore` · `split` — **20/20** desktop
  and **13/13** on the `mobile` project. NOT on `tablet`: that project is
  `grep: /@visual|@a11y/` and collects **zero** of these files, which a first draft of this note
  reported as "12/12 across the tablet and mobile projects" — a project that ran nothing,
  certified. Caught by the same checker.
- **The 820px breakpoint, measured rather than read off the media query** — which is what that
  false line had stood in for. `.pg-split` computes `display: block` at 390px and at 820px and
  `flex` at 821px, so the share basis is inert below the breakpoint: 390 → editor 390px, 820 →
  820px, 821 → 369px (45% of 821), 1194 → 537px.
- The desktop `@smoke` tier — **18/18**, the new case included. (A first draft said 17/17, the
  count from BEFORE this change: it certified the tier as it stood without the test in it.
  `--grep-invert ai-architect` was noise too — that spec carries no `@smoke` tag, so the tier
  never collected it; the NIGHTLY live-AI tier is what spends the real key.)
- The stall reproduction above, before and after, plus the newcomer path.
- **Three engines, not one.** The committed `webkit-*` / `gecko` projects grep for their own
  tags and collect none of these specs, so a scratch config ran them on real WebKit 26 and
  Firefox 142 at this file's viewport: the guard passes on **Chromium, WebKit and Firefox**, and
  `split` + `playground-state` pass on both non-Chromium engines. Worth buying rather than
  caveating for two reasons — the config's own #1227 note records WebKit resolving a stretched
  flex item's cross size differently, and the shipped rule depends on `:has()`.
- **The guard measured red against `origin/main` itself**, not merely against an earlier draft:
  4 full-file runs on the pre-change stylesheet, the guard the only consistent failure in each.

## Two things worth knowing that this does not fix

**Explore's guard is nightly-only.** The regression this change created was caught by
`an Explore reload paints one geometry per element too`, which is untagged — it does not run on
the PR path. Its own comment notes Explore "is the surface a PRISTINE visitor lands on, so its
first paint is the one most people see." The break was an ~1s gap (857px → 1194px), which the
sampler catches robustly on any machine, so it is not fragile; but the new deterministic guard
covers Edit only.

**This spec file has a pre-existing intermittency under parallel workers, and it is not this
change's.** Chasing one failure produced the measurement worth recording. Across **10** full-file
runs on the fix, two runs each failed one case — the boot-view precedence case once, the #1589
clamp case once, a different test each time, and both pass **6/6 in isolation**. Across **10**
runs on `origin/main`'s stylesheet, one run failed **the same boot-view case**, plus an Explore
case. 1-in-10 against 2-in-10 is well inside noise at these sample sizes, and the same shape
appears in the neighbouring specs (`playground-paint.spec.ts:23` failed on `origin/main` too).
So the family is real, pre-existing, and orthogonal to the mechanism — #1815's scope is wider
than the single site it was opened for. Worth stating plainly, because it is the same story as
#1800 one level down: a file that fails intermittently teaches people to re-run, and the genuine
defect this note is about was very nearly dismissed exactly that way.

**A pre-existing Firefox failure, not this diff's.** `split.spec.ts:117` — "a divider drag
released over the preview iframe commits the new ratio" — fails on Firefox and passes on
Chromium and WebKit at the same viewport. It fails **identically against the pre-fix
stylesheet**, so it is not this change; it is an untested combination (the `gecko` project greps
`@gecko`, so this spec has never run there) and most likely the same synthetic-drag limitation
`playground-first-paint.spec.ts` already documents for this splitter. Recorded here rather than
filed, because it is not yet established to be a product defect rather than a harness one.

**A pre-existing mobile flake, not this diff's.** An independent checker saw
`playground-paint.spec.ts:29-31` fail once on `mobile` under two workers and pass 8/8 at
`--workers=1`, identically with and without this change — a click landing before hydration. Off
the path of this change (HARD RULE #18's log-don't-widen branch), so it is recorded here and
filed as **#1815** rather than pulled in.

## What this does NOT claim

**It does not claim the CI failure and the local reproduction are the same event.** They are
the same MECHANISM — the editor pane sized without the preview pane in the document — shown
once by a painted CI frame and once on demand by a stalled response. The CI run itself was
never re-created.

**The "12+ local attempts" are this session's, and leave no artifact.** #1800 independently
records 1 idle + 6 contended passes; the rest — the throttle-20 runs and the six contended
iterations — rest on the transcript and nothing durable. The mechanism does not: it is
reproducible on demand by the committed guard.

**It does not claim the Playground now paints one geometry under every delivery.** It claims
the pane widths no longer depend on which of the two panes has parsed. Anything else that
lands late — a stylesheet, a font, the island — is a different question, and the sampling case
is still the thing that would catch it.
