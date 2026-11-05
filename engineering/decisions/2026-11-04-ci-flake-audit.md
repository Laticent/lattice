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
| (D. Undo `no beforeinput`, iPad) | 41193239222 · 41301950082, both at `089fd23` | Recurred on the iPhone at `6ebacaa` (dispatch 41964538891; the iPad and the Mac passed). WebKit's undo stays disabled after a typed word that Filo did record. A control on unchanged `main` (dispatch 41972682339) failed the same step on the iPad (undo enabled, no `historyUndo`), so it is not this PR's. **Continuation PR #3040 split it in two.** (1) Undo enabled but no `historyUndo`: the deck editor was rebuilt under the typed word when the component list arrived (`Editor.tsx` rebuilt on `known`). Fixed; the iPad rebuild went from 3 of 5 runs to 0 of 8. (2) Undo disabled: WebKit empties its own undo stack 0.4–0.9 s after the word with no page activity a 25 ms watcher can see, in 6 of 264 recorded iOS cycles, on both devices. Not caused by our code as far as the probe can see; open in `followups.d/3034-p8-ios-native-undo-not-enabled.md` |

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
| `e2e/draw-frame-preview.spec.ts` Mermaid fallback (found on this PR) | `locator.evaluate: Execution context was destroyed` at 3.4 s (studio-smoke 41949443186, on a commit that changed only this note) | the poll read the preview frame while the preview replaced its document, and `expect.poll` does not retry a callback that throws | no poll: an init script traps the frame's `window.mermaid` assignment in every document the preview swaps in, and calls the test back when the stand-in lands | desktop, 8/8 at 4 workers |
| `confine-cli` / `mermaid-worker-confine` (Windows) | `null !== 0` at 120 s, empty stderr (41877087984; re-run passed in 5.4 s) | the spawn's 120 s kill fired before anything spoke | the CLI's own render watchdog now fires first (60 s), and the assertion names the signal and output | Linux 4/4; **the hang itself is not explained** (UNVERIFIED cause) |

**Fixed later, by the continuation PR: `e2e/library-reopen-generate.spec.ts` Save after a generate.** studio-smoke
41951781635 clicked an enabled Save about 90 ms after a component generate landed, and `Saved .pricing-trio` never
showed. The trace answers it, and the cause is not the Save button. The previous notice, `Saved .quarter-callout`,
reached the end of its 2.6 s dwell just as `Generated .pricing-trio` was raised. That raise reused the live pill's id,
but Sonner publishes a toast one macrotask late, so the old pill's close fired first. The trace shows the generate's text
inside a pill marked `data-removed: true`. That close came from a superseded raise, so `notify.ts` ignored it, and the
slot stayed live on the dying id. The save's own notice then landed on the same id and was deleted with it. The fix is
in `notify.ts` (trap 3): a close is judged by the pill's id, and a message that landed on a dying pill is raised again on
a fresh one. `notify.dom.test.tsx` reproduces both losses against real Sonner with fake timers and fails without the fix.
The spec also gains a case that clicks Save inside the same task that commits the generated draft. Evidence is in the
continuation PR.

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

**Decided 2026-11-04 on #3034:** D1 **A and B**, D2 **A**, D3 **A**. Items 1–3 below landed in the same PR:
`platform-suites-supervisor.yml` with `tools/platform-suites-triage.js` and an `alert-held` hand-off (1, 2); the
`docs-site` job (1, B); `tools/evidence-plan.js` reading the PR run instead of re-dispatching it (2); and the limits (3):
the overflow sweep 45 min, integration shard 4 30 min, the iOS cold-start waits 150 s (WebDriver script limit 360 s), and
10 minutes on every `npm ci` step in `ci.yml` and `platform-suites.yml`. Then, on 2026-11-05: `studio-smoke` ran out of its 20 minutes with no test failed,
because the browser install's apt-get hit the slow mirror (31 s became 3 min 10 s, run 41954689913). Owner's pick: install
Chromium without `--with-deps` and cache the browser, so that job no longer touches apt. Items 4 and 5 stay open (`followups.d/3034-p4`).

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
| Photo probe fix works in Mobile Safari | iOS 26.5 Simulator, iPad Pro 13-inch (1032 px) and iPhone 17 Pro (402 px) | run 41932405960, job 126932562744: both PASS, 11 of 11 steps each. One run shows the change works there; it cannot show the race is gone, which failed 1 night in 15 |
| Windows tests still pass and now name a hang | `export-confine-windows` on windows-latest | run 41932405960, job 126932562807: PASS |
| Narrated player, back-gesture, library spec | local Chromium / WebKit | counts in §3 |
| strip-keyboard fix closes its race | none reproduced it | **UNVERIFIED** |
| No-test-ran hand-off (D1 A, D2) | `simulate=no-session` dispatch, run 41945352760 | both iOS jobs exit 3 with only the `no-session` mark; `alert` sorted them as infrastructure, filed nothing, and uploaded `alert-held` |
| The supervisor's re-run | `simulate=no-session` dispatch on `main` at `a33fc11`: platform-suites run 42009578616, supervisor run 42010277807 | **Verified 2026-11-05.** Attempt 1: both iOS jobs exited with only the `no-session` mark, and `alert` (job 127187120248) sorted them as infrastructure and ran "Hand the run to the supervisor". The supervisor's `supervise` job (127187235086) found `alert-held`, re-sorted the jobs (`verdict: infra`, both `no-session`), and ran "Re-run the failed jobs once"; "File the held failure" was skipped. Attempt 2 was started by `github-actions[bot]`; its two iOS jobs failed the same way, and its `alert` (job 127188693001, `ATTEMPT: 2`) skipped the hand-off and took the filing path, which a simulated run writes to the step summary instead of the shared issue. The supervisor runs that attempt 2 then triggered (42010738281 and later) were skipped by the job's `run_attempt == 1` guard, so it re-runs once and never loops. **Still open:** whether a re-run job can download the first attempt's `docs-site` artifact. A `simulate` dispatch skips `docs-site`, so both attempts built the site themselves ("Download the prebuilt docs site" skipped); the first real no-session night will show it |
| Shared docs build (D1 B) | run 41945367454: `docs-site` on Linux, then `ios-safari-photo` | the iOS job logged `using the prebuilt docs site`, and iPad and iPhone passed. **The saving is smaller than the 65–94 s estimate:** the Mac job still runs the docs `npm ci` to serve the site (40 s on this run), so only the build itself is saved, about 25–55 s a job. The `docs-site` job (about 2.5 min) runs before the iOS jobs start, so a nightly's wall clock gets longer even as each iOS job's budget gets a little room |
| `studio-smoke` without apt, browser cached | run 41959720275 at `2221da6` | the browser install took 6 s (31 s on a normal day before, 3 min 10 s on the slow-mirror run) on a cold cache; the job finished in 12 min 14 s |
| Runner images pinned | the same commit's platform-suites run | `export-confine`, `wait-for-macos` and `os-sandbox-measure` on `macos-26`; `build-windows`, `export-confine-windows` and `os-sandbox-measure` on `windows-2025`: all green |
