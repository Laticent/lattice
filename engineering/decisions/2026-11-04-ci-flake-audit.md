---
status: proposed
summary: >
  An audit of every red CI result from 2026-10-21 to 2026-11-04: 210 merge-queue runs, 400 pull-request and 113 dispatch
  runs of the platform suites, the last 15 runs of each nightly. Windows is not flaky: its nightly jobs were green 15 of 15,
  and on pull requests one test hung once. The macOS reds a session sees on a pull request are mostly GitHub not giving the job
  a runner (19 of 20). The iOS Simulator suites fail 8 of 15 nights, from three causes: safaridriver does not reach the
  simulator, the photo probe read a preview a phone keeps parked, and fixed deadlines a slow iPhone simulator overruns. Fixes
  the test code owns land in this PR. Fixes that change the CI contract, a budget or alarm meaning are listed for the owner.
---

# CI flake audit (2026-11-04)

**The answer.** "Windows and iOS are flaky" is half right. **Windows is not flaky.** Every Windows job in the last 15
nightlies was green, and on 400 pull-request runs one Windows test hung once. **iOS is**, but not randomly. Three causes
explain all 12 iOS job failures in 8 red nightlies, and only one of them is our test being wrong. What makes sessions
"step over" the macOS checks is mostly **GitHub not giving the job a runner**. A pull request shows that as a red X, and
it reads like a failing test.

Method: parsed run and job lists from the Actions API; downloaded the full logs of every failed or cancelled job and
grepped them. Three read-only agents covered the merge queue, the nightlies, and the pull-request platform runs. Scratch
data is under the session scratchpad and is not committed.

## 1. Where the reds come from

| Surface | Window | Red | What they were |
|---|---|---|---|
| `ci.yml` (merge queue) | 210 runs | 13 failed, 16 cancelled | 6 real (budget overruns, a route-budget breach, an ownership-gate refusal), 7 flaky and already fixed (§4), 3 infrastructure timeouts (§5) |
| `platform-suites.yml` nightly | 15 runs | 8 | **every one an `ios-safari-*` suite**; Windows 15/15 green, non-iOS macOS 15/15 green |
| `platform-suites.yml` on pull requests | 400 runs | 12 failed, 40 cancelled | 40 cancelled by a newer push (gray, not red); 19 macOS jobs **never given a runner**; 1 Windows hang; **0 regressions** |
| Studio E2E nightly | 15 runs | 10 failed, 1 cancelled | about 59 real failing specs (tracked in #2035), plus 4 flaky specs (§3) |
| Other nightlies | 15 runs each | see §5 | golden-bless is really broken; the overflow sweep runs out of time; perf and fit stay green while their issues record failures |

## 2. The iOS Simulator suites: three causes

Failure lines from every red nightly (run id → suite → line):

| Cause | Runs | What the log says |
|---|---|---|
| **A. No session.** safaridriver never reaches Safari in the simulator, so no probe code runs | 40307494617 studio · 40485085426 studio · 40674748940 jpeg · 41301950082 focus-sync | `The session timed out while connecting to a Safari instance` / `The host application never became ready` |
| **B. The probe read a parked preview** | 41829424180 photo (iPhone) | `the probe deck did not stay (the editor holds it; the preview shows "Everything you need to ship, already designed.")` |
| **C. A fixed deadline overrun on a slow iPhone simulator** | 41044755916 photo · 41447813149 photo · 41301950082 studio | `timed out after 30000 ms waiting for the Coach photo finding on slide 2` · `90000 ms waiting for the Studio editor` · `15000 ms waiting for a visible Deck source editor` |
| (D. Undo `no beforeinput`, iPad) | 41193239222 · 41301950082, both at `089fd23` | Not seen in the 3 nightlies since `ded62e7` (#3004). Recorded, not chased |

**Cause A is outside our code.** Apple's safaridriver pairs with Safari inside the simulator over Web Inspector. It
exposes no "ready" signal: the only way to learn it is ready is to ask for a session, and safaridriver waits about
6 minutes before saying no. `run.sh` already does the honest thing. It retries the session, reboots the device once,
and exits 3 ("no probe ran") so the log names the infrastructure, not the probe. What it cannot do is fit those retries
into a 30-minute job that also builds the whole docs site: `41301950082` focus-sync spent 772 s on one failed start and
then had no time for a second one (`no second start: 875 s gone`). That is the budget problem, and the fix that removes
the timer is a **supervisor** (§6, decision 1), not a longer sleep.

**Cause B was our probe, and it is fixed here.** On a phone the Studio shows one pane at a time, and while the Source
pane is up it **parks** the preview (`StudioShell.tsx` `editorSlotVisible`): edits stay deferred, and the parked frame
redraws only when the deck id or the slide index changes (`DeckPreview.tsx` `followWhenParked`). The photo probe typed
its deck on the Source pane and then waited 8 s for the parked frame to show it. When the Studio's starter deck landed
late and the retype left the caret on the same slide index, no redraw was owed, so no amount of waiting could pass. The
probe now does what a person does: when the editor holds the deck, it opens the Preview pane, whose rising edge renders
the latest deck, and then returns to the source. Evidence: the self-test (`probe.selftest.mjs`, Playwright WebKit at
393 px) with the old early return disabled on phones, so only the new path can return, passes; the unmodified self-test
passes on all three shapes. The real-simulator run is §7.

**Cause C is a deadline, not a missed signal.** These waits already poll the page for the thing itself (the editor, the
Coach's finding); they do not sleep and hope. They fail because a cold Studio on the iPhone simulator, on a loaded macOS
runner, can take longer than the deadline. Raising them is a budget change (decision 3).

## 3. Flaky tests fixed in this PR

Each one waited on a clock, or read state once, where the thing it needed could be awaited.

| Test | Signature | Root cause | Fix | Evidence |
|---|---|---|---|---|
| `ios-safari/photo-probe.js` `setDeck` | §2 cause B | read a parked frame | open the Preview pane on a phone | WebKit self-test, forced path, iPhone PASS |
| `tools/verify-narrated-player.mjs` | `1 -> 1 words lit` (integration nightly 40852548355) | `waitForTimeout(220)`, then compared word counts | `waitForFunction` for the next lit word | 3 runs, 56/56 checks each |
| `e2e/back-gesture.spec.ts` Galleries sheet | URL gained `?c=actors&view=read` (3 of 6 WebKit-phone nightlies) | compared the whole URL; the Playground rewrites its query on its own schedule | compare the path, which is what "stays on the page" means | webkit-phone, 5/5 |
| `e2e/library-image-metadata.spec.ts` "Use new name" | `img[alt="B probe"]` not found (studio-smoke 39768706852, 40839795246) | typed into the new deck before the switch landed | wait for the header to show `Untitled deck` | desktop, 9/9 |
| `e2e/strip-keyboard.spec.ts` shortcuts | "Bravo" never duplicated (2 of 6 nightlies) | `Mod+D` pressed before the strip's focus moved | wait for the focused slide first | **unproven locally**: the unfixed spec also passed 40/40 under 8 workers here; with the fix, 69 of 70 passed and the failing line of the one miss was not captured |
| `confine-cli` / `mermaid-worker-confine` (Windows) | `null !== 0` at 120 s, empty stderr (41877087984; re-run passed in 5.4 s) | the spawn's 120 s kill fired before anything spoke | the CLI's own render watchdog now fires first (60 s), and the assertion names the signal and output | Linux 4/4; **the hang itself is not explained** (UNVERIFIED cause) |

Not changed: `editor-lint.spec.ts` "Fix all names a fix it refused" (3 failed, 4 flaky in 6 nightlies). Its click
already waits for the palette row, which appears once lint counts the 501-card deck. That passed 3/3 here in about
15 s per run and overruns 60 s on CI. That is a deadline on a loaded runner, so replacing it with a signal changes nothing.
A trace from a failing run should come first.

## 4. Flakes already fixed (they hold)

Puppeteer's 30 s Chrome launch (#2971's 90 s watchdog); `front-matter-scalar`'s sub-millisecond ratio (5 ms floor);
`mermaid-worker-confine` reading SVG order (matches by node group); the cold Vite `findByRole` (5 s wait); the pre-paint
replay dedupe (#2960); `ubuntu-latest` moving to 26.04 (pinned to 24.04). No recurrence of any of these in the window.

## 5. Red that is not a flake

- **macOS jobs never given a runner: 19 of 20** red non-iOS macOS jobs on pull requests and dispatches, 2026-11-02..04.
  GitHub annotates them "The job was not acquired by Runner of type hosted even after multiple attempts" and "capacity
  constraints … macOS arm64": 0 steps, no runner name, cancelled after 15–21 min. The **run** concludes `failure`, so the
  pull request shows red. The evidence plan (`tools/evidence-plan.js`) tells every session to dispatch the matching
  suites, and those dispatches compete for the same runners. A dispatch run's `alert` job counts the cancel and comments
  on the nightly issue. Now in `engineering/gotchas/ci.md`.
- **golden-bless is broken, and integration-nightly hides it.** Since 2026-11-03 it exits 3:
  `rasterize-showcase` needs `bar.gallery.light.pdf`, which the chart move (#2997) made a first-time golden among about 56,
  and the bless renders at most 40 of those a night. Before that it was cancelled at its 180-minute ceiling 5 times. The
  component-gallery check then stops skipping after its 3-day grace window, by design.
- **Overflow sweep runs out of time.** The corpus grew from 279 to 493 decks; the sweep went from 14 to 29 minutes against
  `timeout-minutes: 30`. It was cancelled 5 of 15 nights.
- **perf-nightly alarms on noise.** `perf-regression.mjs` trips the 0.5 score floor on any drop. Mobile pages sit at
  0.38–0.49, so a −0.01 wobble files a "regression" 3 nights in 6.
- **Studio E2E** is now honestly red with about 59 real failing specs (#2035). The gotcha that called it "green while
  specs fail" is out of date, and this PR corrects it.
- **Merge-queue infrastructure timeouts**: `player no-JS (WebKit)` spent 12–25 minutes in `apt-get` (3 runs); one
  `npm ci` never exited (1 run); integration shard 4 now runs about 21 minutes against a 25-minute cap, and the
  `ci.yml` comment calling it "the shortest leg" is stale.

## 6. What only the owner can decide

Each of these changes the CI contract, a number someone set, or what an alarm means (CLAUDE.md, second filter), so none
is in this PR. The ❓ decision card on the PR carries the options.

1. **A supervisor for the iOS suites instead of in-job timers.** A `workflow_run` job re-runs, once, any iOS job that
   exited 3 (no session), and alerts only if the re-run fails too. That turns cause A from "red 4 nights in 15" into a
   re-run with no budget arithmetic, and lets `run.sh` drop its second-start budget logic. The alternative is building the
   docs site once in its own job and sharing it. Measured from 23 iOS job logs, that build takes 65–94 s per job
   (mean by suite), while one more session start takes 300–500 s (median 322 s for a failed attempt, 297 s for a
   successful start, across 70 attempts). So sharing the build cannot pay for a retry. It is worth doing for cost, but
   it does not fix cause A. Both options add a job. Ending a session request early does not help either: a failure
   takes as long as a success.
2. **Report "no runner" as not a failure.** Have `alert` skip jobs with 0 steps and no runner, and stop the evidence plan
   from dispatching a suite while one for the same commit is queued.
3. **Deadlines and ceilings:** the iOS cold-start waits (cause C), the overflow sweep's 30 minutes (or shard it), the
   integration shard balance, and a `timeout-minutes` on `npm ci`.
4. **perf floor:** trip the 0.5 floor only on a drop larger than the noise band.
5. **golden-bless:** render a missing source gallery before rasterizing it. This is real breakage and fits its own PR.

## 7. Verification

| Claim | Surface | Artifact |
|---|---|---|
| Photo probe fix works at phone width | Playwright WebKit, iPhone 15 Pro shape, forced parked path | self-test PASS (local log) |
| Photo probe fix works in Mobile Safari | iOS Simulator, `ios-safari-photo` dispatched on this branch | linked on the PR |
| Windows tests still pass and now name a hang | `export-confine-windows`, dispatched on this branch | linked on the PR |
| Narrated player, back-gesture, library spec | local Chromium / WebKit | counts in §3 |
| strip-keyboard fix closes its race | none reproduced it | **UNVERIFIED** |
