---
status: shipped
summary: >
  Should integration tests share Chrome? A census (111 of 203 integration files launch their own
  Chrome, 139 launch sites; 104 spawn the CLI, which launches another inside it) and five arms
  measured on 41 files at --test-concurrency=4: today's Chrome per file, one global Chrome, one per
  directory, one Chrome with a context per launch, and a leased pool of 2 with a context per lease.
  Sharing drops a launch from ~0.4-0.7 s to ~0.03-0.16 s and saves up to ~10% wall time (the global arm
  is slower), but no arm reproduced the 30 s launch timeout: today's worst launch was 1.44 s at 4x CPU
  oversubscription and 1.14 s with memory 12.0 GiB above its idle reading. Sharing costs three
  measured things: one dead Chrome failed 17 of 41 files, background tabs in a shared window get no
  animation frames, and calco-logo's transparent screenshot went opaque in 2 of 21 isolated-context runs (a third
  failure there went unidentified).
  Decided 2026-11-27 by the owner: keep one Chrome per test file and skip Chrome sharing. No arm is
  built; the lab stays as a measurement tool.
---

# Shared Chrome for integration tests: census, five arms, measured

**Date:** 2026-11-27 · **Asked by:** the owner on #3518 (answer 2) and D1 on #3415, through Kirk's 🧪
flake desk · **Decided by:** the owner, 2026-11-27: option 0, keep per-file launches, no sharing ·
**Trigger:** `test/integration/export/calco-chips.test.js` timed out in `puppeteer.launch` ("Timed out
after 30000 ms while waiting for the WS endpoint URL to appear in stdout!") during
`npm run test:integration:pr` with a release build on the same machine, canceling 7 tests. It passes
alone. **Built:** nothing in the suite. The measurement scripts are in `tools/shared-chrome-lab/`,
wired into no npm script and no CI job.

## The question, in the owner's words

> "we should be leveraging global setup for chrome. what we don't want is a race condition and
> saturation due to concurrency. If this is for integration and system tests maybe we need to group
> the tests and have each group have its own chrome? if possible maybe we use private browser tabs
> for isolation. we need to measure what works best and least flaky when it comes to sharing. maybe
> we even have a pool of chrome instances tests can use. let's think about it more and validate our
> assumptions to find the best solution."

The assumption under all of it is that **per-file launches under load are what fails**. This note
tests that assumption first and then the four sharing shapes the owner named.

## Census: how the tests get a Chrome today

Counted on `main` at `7c252ae4` with `grep` over `test/integration/**/*.test.js`. A direct launch is
any match of `puppeteer'?\)?\.launch\(`, which catches both `puppeteer.launch(` and
`require('puppeteer').launch(`. Flag and feature counts are files that contain the string, not launch
lines.

| What | Count |
|---|---|
| Integration test files | 203 |
| Files that launch Chrome themselves | 111 (139 launch sites) |
| Of those launches: in a `before()` hook (once per file or suite) | 78 |
| Inside a `test()` body (a Chrome per test) | 18 |
| In a local helper, called per file or per case | ~43 |
| Files that spawn the CLI (`lattice.js`), which launches its own Chrome per render (`lattice.js:3764`, plus an encoder at `:5589` and a pruner at `:5890`) | 104 |
| Files that do both | 46 |
| Files that use neither (no Chrome, or another engine such as Playwright's WebKit and Firefox) | 34 |

**Flags.** All 111 files pass `--no-sandbox`. 52 files pass `--disable-dev-shm-usage`, 16
`--disable-setuid-sandbox`, 11 `--allow-file-access-from-files`, and 4 `--font-render-hinting=none`
(`slide-camera`, `slide-contrast`, `decision-corner-tag-cell-stage`, `component-conformance`). Flags
are per browser, not per page. A shared Chrome has one flag set, so files that need different flags
cannot share one.

**What the files need from their browser.** All of it is per page, so none of it rules out sharing:
`setViewport` (63 files), `emulateMediaType` (2), request interception (7),
`evaluateOnNewDocument` (3), a CDP session (1, `collage-player`), and its own context (1,
`code-sandbox-network`). No file sets `userDataDir`, a download folder, an extension, permissions,
`headless: false`, `browser.pages()`, `browser.process()` or a `disconnected` handler. Only one file
touches cookies or `localStorage`.

**How the runner parallelizes.** `node --test` runs each file in its own process. With no
`--test-concurrency` it runs `availableParallelism() - 1` files at once: 3 on a 4-vCPU
`ubuntu-24.04` runner. CI's integration job runs **in the merge queue only** (`merge_group`), as 4
matrix legs (`.github/workflows/ci.yml`, `integration (node 22, shard K/4)`). Each leg is one
`node --test` over the files `tools/shard-tests.js` deals it by recorded seconds, drawn from the
`parity`, `export` and `invariants` folders only (`test:integration:shard`); the other folders run
in the nightly. So a leg has at most 3 files running, and each
can hold a direct Chrome **and** a CLI Chrome at once. Shard 4 also runs the venue conformance
ratchet after the tests, not alongside them.

**What no sharing arm can reach.** The 104 CLI files launch Chrome inside the CLI child process.
Sharing that Chrome needs the CLI itself to accept an endpoint (for example an env var it connects
to instead of launching), which is a product change to `lattice.js`. Every arm below shares only
the 139 direct launch sites. That is about half the suite's Chrome launches by file count.

## How it was measured

`tools/shared-chrome-lab/run-arm.mjs` runs one arm over a fixed file list and prints one JSON line.
`tools/shared-chrome-lab/preload.cjs` goes into every `node --test` child through `NODE_OPTIONS`.
In a process whose entry file is a `*.test.js`, it replaces `puppeteer.launch` with the arm's
version, so **no test file was edited** and the CLI children a test spawns still launch their own.
In every shared arm the returned browser's `close()` closes only what that launch opened and then
disconnects.

| Arm | What `puppeteer.launch` returns |
|---|---|
| **0 baseline** | a fresh Chrome, as today (the launch is only timed) |
| **(a) global** | a connection to the one Chrome the driver launched before the run |
| **(b) group** | a connection to that directory's Chrome (here 3: `export`, `invariants`, `parity`) |
| **(c) context** | one global Chrome, with a fresh `browser.createBrowserContext()` per launch |
| **(d) pool** | a lease on the least-leased of N=2 Chromes from a small HTTP lease server, with a fresh context per lease |

The arms isolate per **launch**, not per test, because that is the unit the files already use:
78 of 139 launches sit in a `before()`. A context per `test()` would mean editing the files.

**Input.** 41 files from `test/integration/shard-weights.json` that `require('puppeteer')` and call
`launch` themselves: every non-CLI file of 12 s or less, plus `slide-camera`,
`slide-camera-pseudo-content`, `cli-camera-isolation` and `palette-cascade-order`, which also spawn
the CLI. They make 614 tests, 62 launches, and about 181 s of recorded CI weight. `calco-chips` is
included.

**Machine.** This sandbox: 4 vCPU, 15 GiB, Node 22.23.5, puppeteer 25.17.0,
`/usr/bin/google-chrome`. Every arm ran that same binary because this sandbox exports
`PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome`; the driver's shared launch passes no
`executablePath`, so set that variable to reproduce. That matches CI's 4 vCPUs, but every run used `--test-concurrency=4`
where CI uses 3, as a margin (as #34 runs Playwright at 4 workers against CI's 2).

**Load.** `--load` runs one busy loop per CPU plus 2 GiB held resident for the whole run. That
stands in for the release build. `--load-factor 4` runs four busy loops per CPU. `--mem-gib` and
`--io` add memory and disk pressure. Rounds were interleaved (every arm in round 1, then every arm
in round 2), so drift in the machine hit every arm alike.

**Sampled.** Every 250 ms: memory above the idle reading (`MemTotal - MemAvailable` minus the
reading before the run, so loaded runs include the burner's 2 GiB; the machine idled at about
1.2 GiB in use), the count of live `chrom*` processes, and the CPU
busy share over the run. Each launch or connect also logs how long it took.

**The driver changed once, mid-matrix.** After the first six runs (the five quiet runs and
`baseline-load-1`), `run-arm.mjs` gained the `failedTests` field and started keeping each run's TAP.
Nothing about how a run executes changed, but those six records do not name a failing test. That is
why the context arm's quiet failure is unidentified. Every record is in
`tools/shared-chrome-lab/results.json`.

## Results

### Quiet machine and 1× load

Quiet is one run per arm (the context arm's one failure is in the next section). Loaded is the
median of 3 interleaved rounds at 1× load. "Acquire" is the time to get a usable browser: a full
launch for the baseline, a connect plus a context for the others.

| Arm | Wall, quiet | Wall, loaded (median) | Acquire p50 / max, loaded | Peak mem above idle, loaded | Peak Chrome procs, loaded | Failures, loaded (3 runs) |
|---|---|---|---|---|---|---|
| 0 baseline | 61.1 s | 87.3 s | 548 / 1328 ms | 3475 MiB | 66 | 0 |
| (a) global | 72.9 s | 95.1 s | 58 / 245 ms | 3672 MiB | 54 | 0 |
| (b) group (3) | 56.8 s | 78.7 s | 59 / 359 ms | 3972 MiB | 73 | 0 |
| (c) context | 61.0 s | 80.6 s | 72 / 394 ms | 3509 MiB | 46 | 1 run (calco-logo) |
| (d) pool (2) | 61.3 s | 78.4 s | 75 / 353 ms | 3500 MiB | 60 | 1 run (calco-logo) |

Four more quiet runs each of (a), (c) and (d) passed 614/614: (a) took 71.6 to 87.2 s, (c) 56.3 to
63.7 s, and (d) 54.6 to 63.3 s. The very first baseline run, on a cold disk cache, took 143.5 s. It
is left out of the table, and every arm in the matrix ran warm.

### Heavy load: does today's launch break?

| Run | Load | Wall | Acquire p50 / p95 / max | Failures |
|---|---|---|---|---|
| baseline ×2 | 4 busy loops per CPU + 2 GiB | 129.2, 131.1 s | 716-736 / 1123-1279 / **1416-1441 ms** | 0 |
| context ×2 | same | 122.2, 121.9 s | 141-163 / 299-337 / 423-531 ms | 0 |
| pool ×2 | same | 113.0, 119.7 s | 151-158 / 308-330 / 350-519 ms | 0 |
| baseline ×1 | 2 busy loops per CPU + 10 GiB + fsync'd writes | 109.1 s | 605 / 992 / 1139 ms | 0 (peak 12.0 GiB above idle) |
| context ×1 | same | 97.7 s | 103 / 203 / 252 ms | 0 (peak 10.6 GiB above idle) |

**The assumption does not hold as stated.** At four times CPU oversubscription, the worst
per-file launch took 1.44 s, about 20× short of puppeteer's 30 s launch timeout. CPU contention
from parallel test files cannot by itself explain a launch that took 30 s. Memory and disk pressure did not break it either: with 10 GiB held, memory peaking 12.0 GiB above idle (of 15.7 GiB) and a loop of fsync'd writes, the worst launch took 1.14 s. The calco-chips
timeout was **not reproduced** by any arm in this note. A release build differs from a busy loop
in ways this burner does not copy: it spawns many short processes, writes `dist/` heavily, and may
run Chrome itself. Finding which of those starves a launch is the remaining step on the root
cause (#33), and no sharing arm makes it unnecessary.

### Crash blast radius

The driver SIGKILLed the (first) shared Chrome 30 s into a quiet run.

| Arm | Files failed | Tests failed / canceled | Later acquires refused |
|---|---|---|---|
| 0 baseline | 1 by construction (a file's Chrome dies with that file) | – | – |
| (a) global | **17 of 41** | 10 / 68 | 18 |
| (b) group | 1 (only `export`'s Chrome held a live file then) | 4 / 0 | 4 |
| (d) pool (2) | 6 | 1 / 24 | 4 |

None of the prototypes relaunches a dead browser. Once it died, every later acquire was refused
("Target closed" / connection refused). A real design needs a supervisor that replaces a dead
browser and fails only the leases that held it. Without one, a single crash turns into a cascade
of unrelated-looking failures, which is exactly the "one red file cancels many" shape the
calco-chips report started from.

## Three findings that change the design

**1. Tabs in one shared window stop getting frames, so (a) as prototyped is unsafe.** Two pages in
the default context share a window, and only the newest is visible. The older page reports
`document.visibilityState === 'hidden'` and its `requestAnimationFrame` **never fires**. Two pages
in their own contexts each get a window and stay visible at ~31 frames per 500 ms
(`node tools/shared-chrome-lab/visibility-probe.mjs`):

```
default context, older tab: hidden, focus=false; rAF frames in 500 ms: none in 3 s
default context, newer tab: visible, focus=true; rAF frames in 500 ms: 31
own context #1: visible, focus=true; rAF frames in 500 ms: 31
own context #2: visible, focus=true; rAF frames in 500 ms: 32
```

In arm (a), any file waiting on a frame, a paint or a `visibilitychange` can stall whenever another
file opens a tab after it. That is a flake source that depends on test order (F7), though none of
(a)'s 8 full runs hit it. It may also be why (a) was the **slowest** arm (71.6-98.0 s against
54.6-81.9 s for the others), but that is a hypothesis: no run measured a stall, and (b), which has
the same hazard inside each group, was the fastest quiet arm. A context per launch avoids it, which
(c) and (d) do and (a) and (b) could.

**2. One flag set per browser.** The shared arms ran every file with the union of the subset's
flags, minus `--font-render-hinting=none`. So `slide-camera` and `decision-corner-tag-cell-stage`
ran **without** a flag their authors chose, and passed. That proves only that their tolerances
absorbed the difference this time. A real design has to key browsers by flag set (at least
"default" and "font hinting off") or settle one flag set for the whole suite, which is a fidelity
call for review, not for a pool to make silently.

**3. A context-isolated browser changed one result: `calco-logo`.** Its `check` test takes
`screenshot({ omitBackground: true })` and expects a transparent corner. In 2 of 21 full-subset
runs in an isolated-context arm (context 1 of 11, pool 1 of 10), the corner came back opaque white
(`255,255,255,255`). One more context run failed one test that went unrecorded (see the driver
change above), so the count may be 3. It failed in 0 of 8 full runs of (a), 0 of 7 of baseline and
0 of 4 of group. Alone it passed 6 of 6 in the context arm (and 6 of 6 in (a)). Beside its three calco
neighbors, run with `--load`, it passed 6 of 6 in each; those control runs are not in
`results.json`. So the failure
needs the full concurrent mix in one browser with several windows. Its cause is **not found**.
`omitBackground` sets a per-page background override (puppeteer's
`EmulationManager`, `Emulation.setDefaultBackgroundColorOverride`), so the likely suspects are a
compositor or window race between contexts in one browser process. Adopting (c) or (d) means
root-causing this first. Otherwise sharing *adds* a flake to a suite meant to lose one.

## The options

Costs and gains are from the tables above, on this subset at concurrency 4. Wall-time numbers are
for the 41-file subset, not the suite.

| Option | What it is | Buys | Costs | Risks |
|---|---|---|---|---|
| **0. Keep per-file, find the cause** | Leave launches as they are; reproduce the release-build case and fix what actually starves the launch | Full isolation; crash radius of one file; no new harness | No speed gain; the root cause is still open | The timeout recurs until it is found |
| **(a) One global Chrome** | Global setup launches one; every file connects | Acquire 548 → 58 ms | Slowest arm (+9% loaded, +19% quiet); one flag set | Hidden tabs can get no frames (probe); one crash failed 17/41 files |
| **(b) A Chrome per group** | One per directory (or per shard) | Fastest quiet (−7%); −10% loaded | Most memory (+497 MiB loaded); one flag set per group | Hidden tabs inside a group (a context per launch would fix it, unmeasured); crash radius is the group |
| **(c) One Chrome, a context per launch** | Global Chrome; each file's launch gets its own context | −8% loaded, −6% at 4× load; fewest Chrome procs (46 vs 66); contexts keep cookies and storage apart | One flag set | calco-logo flake (1 of 11, maybe 2); a crash takes every live file (like (a)) |
| **(d) Pool of N, a context per lease** | N Chromes launched in global setup; each launch leases the least-used one and gets a context | −10% loaded, −11% at 4× load; crash radius ~1/N; leases spread renderer load | A lease server, a supervisor and flag-set keys to build and keep | calco-logo flake (1 of 10); a hung (not crashed) browser stalls its leases until the protocol timeout |

**What each gives up.** A context gives its pages their own cookies, storage, cache and permission
state. A shared browser does **not** keep apart its process-wide state: GPU and compositor, the
flag set, the HTTP cache of the default context in (a) and (b), and the crash. Baseline gives up
nothing.

**How a crash or hang shows up.** In every shared arm, a crash fires `disconnected` on every
client and fails in-flight calls with "Protocol error … Target closed". A supervisor can log which
browser died and which leases it held, then relaunch. A **hang** is worse: puppeteer's
`protocolTimeout` (180 s by default) fails each pending call separately, so a hung shared browser
reads as many slow, unrelated test failures. A pool needs a health probe (for example
`browser.version()` against a short deadline, run by the supervisor rather than by a test) to turn
that into one named error.

## Decision (2026-11-27)

The owner chose **option 0**: "we keep what we have and skip chrome sharing." Integration tests keep
launching their own Chrome, as they do today. None of arms (a) to (d) will be built, and nothing in
the suite, the CLI or CI changes. `tools/shared-chrome-lab/` stays, because its baseline arm times every
launch and can serve if the launch timeout is chased again.

The decision is about sharing only. The calco-chips launch timeout that started this note is still
open. Under HARD RULE #33 it is fixed at its cause on its own branch, `test/calco-chips-launch-timeout`,
which the flake desk routed back to this note's author.

## Recommendation (as written before the decision)

**Do not adopt a shared Chrome to fix the calco-chips timeout. It does not address the cause this
note could measure.** Today's launch held under four times CPU oversubscription. The 30 s timeout
needs something this burner does not copy. The next step is to reproduce that case exactly: run
`npm run test:integration:pr` beside the real release build and record per-launch timings with
this preload's baseline arm. That fixes it at its root (#33). Building a pool first would make the
symptom rarer and its cause harder to find.

**If the owner wants the speed anyway, the shape is (d): a pool of contexts.** It tied (b) as the fastest
arm at 1× load (−10%), was the fastest at 4× load (−11%), keeps a crash to about 1/N of the live
files, and avoids the hidden-tab hazard. It still needs three things first: calco-logo's transparent-screenshot failure
root-caused; browsers keyed by flag set; and a supervisor that relaunches a dead browser and probes
a hung one. Expect about 10% of the direct-launch files' wall time back, and nothing on the 104 CLI
files until the CLI can connect to an endpoint.

**Reject (a) and (b) as prototyped, with every file in the default context.** Both put several
tabs in one window, and the probe showed that a hidden tab gets no frames. Neither tripped on it in
these runs, so this rests on the probe, not on a failure. (b) with a context per launch is a
pool keyed by directory instead of by load. It was not measured, and it keeps (b)'s larger
memory.

## Not decided here

- Any CI job or step change. Running the suite at a different concurrency or adding a global-setup
  step would change the CI contract (CLAUDE.md, SECOND FILTER), so it is proposed, not made.
- A CLI endpoint hook (`lattice.js` connecting to a shared browser). It is a product change.
- Pool size. N=2 was measured; N is a number for the owner to set.

## Reproduce

```bash
npm run build
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome   # or any Chrome; every arm must use the same one
# tools/shared-chrome-lab/files.txt is the 41-file list this note used
node tools/shared-chrome-lab/run-arm.mjs --arm baseline --files tools/shared-chrome-lab/files.txt --concurrency 4
node tools/shared-chrome-lab/run-arm.mjs --arm pool --pool 2 --files tools/shared-chrome-lab/files.txt --load
node tools/shared-chrome-lab/run-arm.mjs --arm global --files tools/shared-chrome-lab/files.txt --kill-after 30
bash tools/shared-chrome-lab/matrix.sh tools/shared-chrome-lab/files.txt     # the whole matrix, interleaved (~45 min; writes .scratch/sc/results.jsonl)
node tools/shared-chrome-lab/visibility-probe.mjs
```
