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
  sizing the panes pre-hydration with a percentage `flex-basis` share of the CONTAINER instead
  of a `flex-grow` share of the children present. That broke Explore's first paint (the preview
  had been inheriting full-bleed from being the only growing child) — caught by the same spec,
  fixed in the same change. Guarded by a new deterministic `@smoke` case that serves the
  document cut at the preview panel; measured red against the pre-fix stylesheet at exactly the
  width CI reported.
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

## The cause: a streamed document, and a share of the wrong thing

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

## The fix: a share of the container, not of the children present

```css
.pg-split > #pg-split-editor {
	flex-grow: 0;
	flex-basis: calc(var(--pg-split-a, 45) / (var(--pg-split-a, 45) + var(--pg-split-b, 55)) * 100%);
}
```

A percentage basis is the same width whether or not the sibling has parsed. The shares are
normalized against their own sum because that is what the saved pair is (`pgTotal = pgA + pgB`
in the seed), not percentages of 100. The separator's 1px overflows the row and default
`flex-shrink` absorbs it, landing inside the spec's own ±2 tolerance — measured 337 against a
settled 337, and 537 against 537 on the newcomer path where the CSS fallbacks (the panels' own
`defaultSize`) are what paint. Once React commits, the library writes real inline `flex-basis`
AND `flex-grow`, so it takes the layout back exactly as before.

### It broke Explore, and the same spec caught it

Explore hides the editor pane and the handle so the preview goes full-bleed. It had been
getting that **for free**: with the editor hidden the preview was the only growing child. A
share is a share, so the first version of this fix painted Explore's preview at its EDIT width
(857 of 1194) and corrected to full-bleed at hydration — the same assembles-in-view defect,
moved one surface over, and `playground-first-paint.spec.ts:357` failed on it immediately.
`flex-basis: 100%` on the preview inside the existing Explore block restores it. A regression
this change created, so it does not ship (HARD RULE #18).

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
  Firefox 142 at this file's viewport: the new guard passes on **Chromium, WebKit and Firefox**,
  and `split` + `playground-state` pass on both non-Chromium engines. A percentage `flex-basis`
  is exactly the shape of thing the config's #1227 note flags as resolving differently in
  WebKit, so this was worth buying rather than caveating.

## Two things worth knowing that this does not fix

**Explore's guard is nightly-only.** The regression this change created was caught by
`an Explore reload paints one geometry per element too`, which is untagged — it does not run on
the PR path. Its own comment notes Explore "is the surface a PRISTINE visitor lands on, so its
first paint is the one most people see." The break was an ~1s gap (857px → 1194px), which the
sampler catches robustly on any machine, so it is not fragile; but the new deterministic guard
covers Edit only.

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
