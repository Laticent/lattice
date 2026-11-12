---
status: shipped
summary: >
  HARD RULE #32: a test passes or fails on the code alone. Lists the nine shapes of a flaky test (F1 stopwatch assertion
  to F9 retries) with the fix for each. checkFlakyTests in tools/check-ownership.js parses every committed test file and
  holds its fixed sleeps, stopwatch assertions and unseeded randoms exactly to tools/flaky-test-baseline.json (563 hits in
  221 files on day one), so the backlog can only shrink; `// flaky-ok: <why>` marks a line that is right as it is. A
  docs/e2e waitForTimeout stays with checkE2ESleeps. Playwright's CI retries go to 0 when the audit (followups.d/3045)
  empties the baseline.
---

# Flaky tests: what counts, the rule, and how it is held

**Date:** 2026-11-06 · **Decided by:** the owner, on PR 3041's flake ("I need a hard rule to ensure we don't write flaky
tests"), choosing a gate with a ratchet and retries off after the audit · **Rule:** HARD RULE #32 in CLAUDE.md ·
**Gate:** `checkFlakyTests` in `tools/check-ownership.js`, run by `build:check` · **Backlog:**
`followups.d/3045-p1-flaky-test-audit.md`

## Why this note exists

PR 3041 was ejected from the merge queue twice by `test/unit/core/class-directive-scan.test.js`, a test that divided one
timing of a scan by another and failed at 25×. When #3042 made the clean scan about 35 times faster (1.70 ms to
0.05 ms), one sample of a time that short became mostly noise: a median ratio of 10 and a maximum of 58. The code was
correct. The test was measuring the machine. The CI flake audit (`2026-11-04-ci-flake-audit.md` §3 and §4) had already
fixed seven flakes of the same family, one at a time, and nothing stopped the next one being written.

## What a flaky test is

A test is flaky when the same code can pass or fail depending on something the test does not control. Every shape below
is a version of that one sentence. The question to ask of any assertion: does it ask "did the right thing happen?" or
"did it happen in time?". Only the first is a test.

| # | Shape | What it looks like | The fix |
|---|---|---|---|
| F1 | **Stopwatch assertion.** Pass or fail hangs on how long something took: a raw budget, or a ratio of two timings. | `expect(performance.now() - t).toBeLessThan(250)`; the class-directive ratio | Count work, not milliseconds: characters read, nodes visited, calls made, asserted against a bound on the input's size. Speed goes to `npm run bench` (HARD RULE #19), which reports and never fails a PR. |
| F2 | **Fixed sleep, then check.** Wait N ms and hope the thing finished. | `waitForTimeout(220)`, then compare word counts | Wait for the signal itself: `waitForFunction`, `expect.poll`, an event, a promise the code exposes. |
| F3 | **Read once, too early.** Check state a single time when it settles on its own schedule. | typed into a deck before the switch landed; compared a URL the page rewrites later | Await the state you need, then assert. Compare only what the test is about (the path, not the whole URL). |
| F4 | **A deadline tighter than a slow machine.** A timeout that passes on a laptop and overruns on a loaded CI runner. | `editor-lint` "Fix all" overrunning 60 s on CI | Make the work smaller, or wait on progress rather than a fixed total. A deadline exists to catch a hang, so size it for the slowest runner, not the median. |
| F5 | **Randomness without a seed.** A failure nobody can replay. | `Math.random()` in a fuzz | A seeded generator, with the seed printed in the failure message. |
| F6 | **The real network or a live service.** | `fetch('https://…')` from a test | Stub it (`page.route`, a fake server, a recorded reply). A live service belongs in a sanctioned nightly, never per PR (as HARD RULE #24 does for OpenRouter). |
| F7 | **Shared state or test order.** One test leaks into the next; a fixed port or temp folder collides under parallel runs. | | A fresh fixture per test, a free port the OS picks, a unique temp folder. |
| F8 | **Depends on the machine.** The timezone, the locale, today's date, installed fonts, the CPU count, the order a folder lists its files, exact pixels across machines. | `new Date()`; a pixel diff against a golden made on another machine | Pin the input: a fixed date, `TZ` and locale set by the test, sorted listings, self-hosted fonts, a pixel tolerance. |
| F9 | **Retries that hide it.** A flaky test that passes on its second try reports green. | `retries: isCI ? 1 : 0` in `docs/playwright.config.ts` | No retries. A flake is fixed at its cause (HARD RULE #18). |

## How the rule is held

**The gate counts five shapes** (three for #32, two for #33, below) in every committed test file: every `*.test.*` and `*.spec.*`, and every file under
`docs/e2e/` (helpers such as `studio-fixture.ts` included); fixtures aside. It **parses** each file with TypeScript, as
`checkE2ESleeps` does, so a comment or a string never counts and a named duration does.

| Shape | F | What it counts |
|---|---|---|
| `fixed-sleep` | F2 | a hand-made sleep (`new Promise((r) => setTimeout(r, ANY))`, a named duration included; a `setTimeout` whose callback does more than resolve, such as a hang guard in a `Promise.race`, is not one), a call to a `sleep` / `delay` / `wait` / `pause` helper, and `waitForTimeout(…)` outside `docs/e2e` |
| `clock-assert` | F1 | an `expect` / `assert` whose arguments hold a **timing**: one clock reading (`performance.now()`, `Date.now()`, `process.hrtime`) minus another, directly or through a variable or a function the same file built from one |
| `unseeded-random` | F5 | `Math.random()` |

How a timing is followed, because the class-directive ratio is not on one line:
- A name resolves to its nearest enclosing declaration, so a `const t = Date.now()` in one test does not taint a `t` in
  the next.
- A function is a timing only if it returns one, and an object literal does not pass one on, so a helper that measures
  inside and returns `{ ok }` does not taint the assertions on `ok`.
- A clock used as a date (`const T0 = Date.now() - 3_600_000`) is not a timing. That is F8, and it is not counted.

**A `docs/e2e` `waitForTimeout` is not counted here.** `checkE2ESleeps` and `SANCTIONED_E2E_SLEEPS` already hold every
one, parsed, with one written reason per (file, duration), including the absence assertions that gate judges correct.
HARD RULE #15 allows one gate per fact. A hand-made sleep in `docs/e2e` is counted here, because that gate reads only
`waitForTimeout`.

**A ratchet, not a ban** (the owner's choice, 2026-11-06). Day one holds 384 fixed sleeps, 164 stopwatch assertions and
15 unseeded randoms: 563 hits in 221 files. Blocking them at once would have meant one PR rewriting every test. Instead
each file's count is held exactly to `tools/flaky-test-baseline.json`:
- a new hit in a file fails the build;
- a file new to the baseline fails;
- a count the baseline overstates fails, so the backlog can only shrink.

**It caught two on its queue runs, and the class-directive test blocked its first commit.** All three are fixed at
their cause in this PR, as the rule asks of the session that finds a flaky test:
- #3043 merged while this PR sat in the merge queue and added a stopwatch assertion to
  `test/unit/core/meta-record.test.js` (`performance.now() - t0 < 250`, guarding the comment scan against going
  quadratic). `comments()` in `lib/core/meta-record.mjs` now takes an optional `work` counter, and the test asserts the
  scan took at most 2 × 8,000 steps: it takes 16,000, and a scan of every fence per comment takes 32,012,000 and fails.
- `test/unit/core/class-directive-scan.test.js` "an UNTERMINATED `<!--` stays linear", the ratio test this rule was born
  from, failed this PR's own pre-commit hook at 43×. It now totals the characters every `-->` search covers and holds
  them to three times the source: 1.0 and 1.7 on its two decks, and 2,501 with the parser's search memo removed, which
  fails. It needs no product change. PR #3044's best-of-7 stopgap for the same test is superseded.
- #3040 merged while this PR was queued again and added `docs/src/components/studio/editor-known-rebuild.test.tsx`
  with three fixed sleeps (1 s, 1 s and 4 s) around a lint pass the editor must drop. Each now waits on its signal:
  the mocked first slide records the moment a lint pass awaits it, the editor's reported counts show validation off,
  and a wrapped `loadAuthoring` records the lint core's arrival, after which the queued promise callbacks drain. With
  the editor's stale-pass guard removed, the test fails on the leaked finding (`{ total: 1, fixable: 1 }`).

**A line that is right as it is says so:** `// flaky-ok: <why>` on the line. A deadline computed for a wait's timeout,
the tick of a polling loop, and a timing that is logged and never asserted are the cases seen so far. So is a
**hang guard sized by F4**, the one stopwatch the audit keeps, for a reason the next section gives. The reason is
required; a bare `flaky-ok` still counts.

**The tools the audit rewrites with** (first used on `test/unit/core`, 2026-11-06):
- `test/helpers/runtime-boot.js`: `bootRuntime(dom)` runs `dist/lattice-runtime.js` in a jsdom window on a virtual
  clock and returns when its timer queue is empty, a signal where the tests slept 300 to 1,000 ms. `virtualClock(win)`
  is the same clock for any jsdom window. Nine of `test/unit/core`'s sleeps were this boot. Five of their seven files
  passed with no wait at all, so those sleeps waited for nothing; the other two fail without `settle()`.
  `settle({ onStep })` (added 2026-11-11, `test/integration/parity`) calls `onStep()` at every resting point between
  the runtime's callbacks, so a test that must see an invariant hold THROUGHOUT a run checks every state a frame could
  paint; `runtime-mode-geometry`'s backdrop window used a 10 ms poll on the real clock that saw only the states its ticks
  hit. A settle that never ends is a finding, not a cap to raise: see "The virtual clock found a live loop" below.
  `settle({ done })` and `advance(ms)` (added 2026-11-12, `test/unit/components/flowchart.test.js`) are for code whose
  own timers are the behavior under test: `done()` stops at the first resting point where the signal holds (what a
  polling loop waited for), and `advance(ms)` fires every timer due within `ms`, in order, and no other, so a debounce
  is checked at 1 ms short of its delay and past it. Name such a helper for what it advances past (`pastRewrap`), not
  `pause` or `sleep`: the census counts those names as sleeps whatever they do.
- node:test's `mock.timers` (`setTimeout`, `setInterval`, `Date`) where the code under test reads Node's own timers: a
  timeout bound is checked at 1 ms before and at the bound, which the old `elapsed >= 140 && < 500` window could not do.
- `test/helpers/work-count.js`: `scanWork(fn)` totals the characters every string search and regex `exec` covered, so a
  scan that restarts from every opener shows as about n / 2 per character where a linear one shows a small constant.
  `charReads(fn)` counts what a hand-written walker does instead (`charCodeAt`, `codePointAt`, and the arrays an Array
  search walks), for the CSS and HTML readers that never call a search. Each rewritten bound sits a few times above
  the measured count, and each was shown failing on a copy of the module with the old shape put back.
- `test/helpers/property-reads.js` (added 2026-11-11, `docs/src/lib`): `countReads(root, key, { limit })` deep-copies
  a structure into Proxies that count reads of one property, so a walk over a grammar tree, which touches no string,
  costs a visit count. A shared node stays one copy, and past `limit` it throws, so a walk gone exponential fails at
  once instead of hanging the runner. The segno grammar, codegen and publish-review tests bound visits per node with it.
- `test/helpers/page-settle.js` (`test/integration/export`): `trackPageWork(page)`, called before the page navigates,
  keeps a ledger of the timers, frames and requests a real page has queued, and its `settled()` resolves once none is
  left. `settled({ frames: 3 })` also waits for three quiet frames in a row, so a resize's `ResizeObserver` work has
  run; `{ images: true }` also waits for every `<img>` to complete. A string timer stays off the ledger, because
  wrapping it would change what the page runs, and a page that never settles fails at the deadline, naming what was
  still queued. It replaced 1.5 to 2.5 s sleeps and absorbed `page-quiet.js`.
- `test/helpers/request-log.js` (`test/integration/export`): `drained()` resolves once every connection a client
  already made to a test listener has been read to its end. It connects once itself and waits for the listener to
  accept that connection, which the kernel does in arrival order, so every earlier connection is in. It needs the
  client gone first. A live browser has nothing to drain, so an absence check runs a WITNESS: the same attempts with no
  walls against a second listener, started after the walled attempts. The witness proves how long one attempt takes
  to land, not that a subject holding a request back on purpose has sent it.
- `docs/e2e` (added 2026-11-12, the `docs/e2e` pass): five helpers replaced 105 of the 106 sanctioned `waitForTimeout` calls
  (51 of 52 entries, in 35 files) and the 39 counted hits in 24 spec files.
  - `barriers.ts`: `schedulerDrained(target)` posts MessageChannel rounds behind React's scheduler, so a state update
    the last action queued has committed. `requestsFlushed(page)` fetches a numbered marker and waits for the route to
    see it, so every earlier request is in. `documentSettled(target, within)` waits for the images, media and frames
    under `within` to answer, then two frames. `layoutSettled` is two frames, a scheduler drain and two frames;
    `motionSettled` adds every finite animation finishing. Scope `documentSettled` to the region the test reads: the
    whole Studio page never settles, because a frame in it keeps loading.
  - `frame-clock.ts`: `pauseFrames(page)` stops the page clock; `stepFrame(page)` runs it 16 ms and drains the
    scheduler, so a test that must see every frame of an animation or a timed cue (Present's emphasis, beats, the
    guide cursor) reads each one instead of sampling the real clock. `stepFramesUntil(page, done, limit)` stops at a
    condition, with a frame cap that fails loudly.
  - `route-hold.ts`: `routeHolds()` holds a mocked request open until the test releases it, so a test of an in-flight
    state (a streaming chat reply, a logo still measuring) chooses when the request lands instead of racing it.
  - `net-witness.ts`: `witnessLanded(context, { udp })` makes the same kinds of attempt (fetch, WebSocket, image, and an
    RTC STUN packet) from a fresh page against a second pair of listeners and waits until they land. An absence check
    ("the sandbox sent nothing") runs it after the walled attempts, so "nothing arrived" means "nothing was sent", not
    "not yet".
  - `photo-format.ts`: `confirmPhotoFormat(page)` answers the add-photo format dialog and waits for it to close, the
    step four library-image specs slept through.
  Where no signal existed, the product now publishes one on `<html>` for tests: `data-overlay-back` and
  `data-overlay-back-gen` (`overlay-back.ts`, the back-gesture stack), `data-stage-loss` and `data-stage-placement`
  (`stage-window.js`), and `data-deck-imports` (`StudioShell.tsx`).

**The virtual clock found a live loop** (2026-11-11). When `runtime-cards-align.test.js` moved from a 250 ms sleep to
`bootRuntime`, its boot over every governed component never went idle: `settle()` gave up after 2,000 callbacks. The
`wifi`, `contact` and `gift-card` adapters assigned `innerHTML` on every pass even when `renderCard` handed back the
same string (a slide with no card fields yet), and that write scheduled the next pass. In Chromium one such slide ran
21 passes in 3 s, against 2 for a `content` slide; it now runs 2. The sleep had read mid-loop and passed. The three
adapters now share `rebuildCardsInDom` in `lib/transformers/qr-card-dom.js`, which writes only on a change,
and `test/unit/transformers/qr-card-dom-quiet.test.js` counts the mutation records. So a settle that never ends is a
defect to chase, never a step cap to raise.

**Backtracking inside one regex has no count to read.** The audit tried V8's
`--regexp-backtracks-before-fallback` with `--trace-experimental-regexp-engine`: the count rises about once per start
position, so a linear pattern and a quadratic one on 40,000 characters both land between 30,000 and 100,000. A limit
under the input's length "caught" every old pattern and flagged linear ones too (`CLAUSE_BREAK` in
`lib/core/relationship.js`, 0.1 to 0.8 ms for 16 times the input). Release Node prints no bytecode trace. So a test
guarding an ambiguous pattern (`\s*` either side of an optional piece) stays a timing, sized as F4 sizes a deadline:
an input the old pattern needs a minute or more for, a bound at least 25 times today's cost and at least ten times
under the old pattern's, and `// flaky-ok:` with both measurements on the line. Its mutation arm is the old pattern
overrunning the bound on the test's own input.

**Backtracking now has a verdict instead of a clock: the regex census** (owner D1 on #3092, 2026-11-08: ratchet
first, then drain). `recheck` 4.6.2 decides a pattern's worst case from its automaton (`checker: 'automaton'`),
which needs no input and no timing. It runs only in `tools/regex-census.js`, from its own pinned folder
`tools/recheck/` (the pure-JS backend, about 12 MB with the optional native binaries left out, so the root `npm ci`
carries none of it), with **no timeout**: recheck's own size limits stop a pattern it cannot model, and a child
process with a fixed 3 GB heap stops one that exhausts memory, so a verdict depends on the pattern, not the machine.
The answer for every distinct literal in `lib/**` (keyed on its text, `/source/flags`) is committed in
`tools/regex-census.json`, so only a new or changed literal is decided again.
- **The gate**, `checkRegexCensus` in `tools/check-ownership.js` (via `build:check`), never runs recheck. It parses
  `lib/**` with TypeScript and fails on a literal with no verdict, on a verdict whose literal is gone, and on any
  file whose count of literals that are not `safe` differs from the table's `backlog`. The count is what makes it a
  ratchet: a slow pattern copied into another file fails even though its verdict is cached. A pattern that is slow in
  principle but bounded by construction says so on its line, `// regex-ok: <why>`, the reason required.
- **The writer**, `npm run regex:census -- --write`, decides what is missing, drops what is stale, and refuses both
  a new literal recheck does not call linear and a raised backlog (`--raise` overrides it, with the reason in the
  PR). A table that does not parse is an error, never a fresh start. The gate holds counts, not identities, so a file
  that trades a drained pattern for a new slow one passes the gate; the writer is what refuses the new one. `--check '/…/'` prints one pattern's
  verdict and attack string; `--verify` re-decides every entry.
- **The pre-commit re-check** (owner D1, 2026-11-09): the gate trusts the verdict it is shown, so a hand-typed `"safe"`
  passed `build:check`. The lefthook job `regex-census-recheck` runs `node tools/regex-census.js --staged` whenever the
  table is staged: it re-decides, with recheck, each `safe` verdict the staged table adds or changes against `HEAD`, and blocks
  the commit on any recheck answers differently. Only `safe` needs proof: it is the one verdict that lowers a backlog,
  and a hand-typed slow verdict only makes the gate stricter (re-deciding an `unknown` that exhausts recheck's heap
  took 29 minutes in review). A commit that does not stage the table pays nothing; one that does pays about 1 s per
  changed safe verdict (1.04 s for the one planted in the PR that added it). A pre-commit hook, not a CI step, because
  recheck lives outside the root `npm ci`. So the guarantee is local: `--no-verify` (barred by HARD RULE #14),
  `LEFTHOOK=0`, a clone without hooks, a merge, a rebase or a web edit all skip it, and `build:check` still trusts the
  table it is shown.
- **The first census** (3,846 regex literals in 407 files, 2,352 distinct): 1,820 safe, 413 polynomial, 1
  exponential (`lib/packages/npm-plugin-loader.js`), and 118 unknown (115 that recheck cannot model, 3 that outgrow
  the heap). The backlog is 699 literals in 191 files, led by `lint-core.js` (93), `chart-narration.js` and `carousel.js`.
  Most are the unanchored `\s+x` shape, quadratic only on a long run of the leading class. An `unknown` verdict
  (look-around and back-references, which recheck cannot model, or a pattern that outgrows the heap) counts as slow:
  the gate never treats "could not decide" as linear.
- **What replaces a hang guard**: `test/helpers/regex-trace.js`. `assertLinearRegexes(fn)` wraps
  `RegExp.prototype.exec`, which every string and RegExp method reaches once the prototype's `exec` is not the
  built-in one (ECMA-262 RegExpExec), records every pattern the call ran, and fails on any whose verdict is not
  `safe`, and on any the table does not hold (a pattern built at run time), unless the test names it in `allow` with
  recheck's verdict as the reason. `test/helpers/regex-differential.js` is the rewrite's other half: a seeded fuzz
  that scans the old pattern and the new one over the same draws and returns the first input where they disagree.
- **It found live slow patterns the stopwatches missed.** A hang guard only times the input it was written for. The
  trace sees every pattern the call runs, so the first guards it replaced flagged two that their inputs never
  reached: the fence-opener `/^([ \t]*)(`{3,}|~{3,})(.*)$/` (about ten copies across `lib/**`; a line split on `\n`
  can still hold a U+2028, and then `(.*)$` retries every split of the backtick run), and lift-bracket-span's
  `<p\b[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>` over many unclosed openers. Both are drained: `lib/core/fence-opener.js`
  reads the fence line in one pass (8 copies swapped), and `paragraphCodeSpans` in lift-bracket-span.js scans the
  paragraphs linearly; each is held to its old pattern by a seeded differential fuzz with a mutation arm. Ten of the
  twenty hang guards were retired in part 3 and seven more in part 4 (2026-11-09). The three left are
  chart-row-record's, which run all of lint and wait on the lint-core drain (`followups.d/3045-p2-regex-recheck-gate.md`).
  A third, found 2026-11-12 when `findQuadrantAxisIssues`'s stopwatch became a trace: `readIsland`'s `bareOpener` in
  `lib/core/directive-island.mjs`, `^\s*\n\s*(?:\{[^}]*=|@meta\{)`, split a comment's run of blank lines between its
  two `\s*` (192 ms at 20,000, about 19 s at 200,000). It is two linear tests now (a line break in the leading whitespace, then the record head), held to
  the old pattern by a seeded fuzz of 20,000 draws.
  The trace cannot see a hand-written loop, so each part-4 reader is also held to linear work by `scanWork`
  (test/unit/core/linear-readers-work.test.js), which caught two readers that still searched afresh from every opener.
  recheck cannot model a look-around, so a pattern made linear by one (a look-behind, or the atomic-group idiom
  `(?=(\s*))\1`) carries its proof in writing: `// regex-ok:` on its line and the same reason in the test's `allow`.
- **Cost**: about 1.2 s per `build:check` on an idle machine (1.23 s cold, 1.16 to 1.28 s warm; 1.9 to 2.7 s with
  the CPU busy), the TypeScript parse of 407 files, about the same as the flaky census beside it. The whole
  `build:check` ran in 37.6 s. The first full census took about 45 minutes on 4 cores; a new literal takes 0.5 to
  3 s.

**The gate read a `flaky-ok` mark from the wrong line after a U+2028 or U+2029.** TypeScript counts both as line
breaks and `text.split('\n')` does not, so in `test/unit/core/lattice-doc.test.js` every mark below a string holding
one was read two lines off and ignored. `flakyTestHits` now cuts the line from TypeScript's own line starts.

**The docs unit tests ran a build, not the source** (found 2026-11-11, F8's cousin). Each of the 17 `docs/src/lib`
packages names its gitignored `dist/` in `main` and its source under the `@laticent/source` export, and the docs import
them by folder, which reads `main`. So a stale `dist/` decided the result, and a mutation arm against the source proved
nothing until the package was rebuilt. `libSource()` in `docs/vitest.config.ts` sends any import that lands on a
`src/lib/<pkg>/dist/` entry to the source file the package exports beside it.

**Without git the gate refuses once** ("could not list the committed test files … do not edit the baseline to match").
An empty listing would otherwise read as every entry stale, and following that advice would empty the baseline.

**What the gate cannot see** is held by review:
- a timing that reaches an assertion through an assignment, a `.push` or a `.map`, not a declaration
  (`test/benchmark/relationship-scaling.test.js` pushes each timing into an array and asserts on a sorted pick), or
  through another module;
- a clock compared without a subtraction (`expect(performance.now()).toBeLessThan(start + 5)`), and
  `process.hrtime(start)`'s one-call delta, which no test uses today;
- one sleep swapped for another in the same file, since the count is per file;
- a file not yet committed;
- F3, F4, F7 and F8, which are behavior, not spelling;
- F6, because in this tree a `fetch('https://…')` is almost always test DATA (a hostile deck the sanitizer must refuse),
  and a parser cannot tell data from a call the test makes.

**Retries.** `docs/playwright.config.ts` keeps `retries: 1` on CI while the audit rewrites the e2e specs. The audit's
last PR sets it to 0 (the owner's choice, 2026-11-06). Turning it off first would bury the audit's signal under the
Studio nightly's roughly 59 known real failures (#2035). Until then, the rule's "never retried" is the target, not the
state of the config.

**Cost.** Of the 1,895 committed test files in scope, the census parses the 371 that mention a clock, a sleep or
`Math.random`, once per `build:check`: about 2 s on a warm run (1.8 to 2.1 s, measured), 3.2 s on a cold one, out of
about 30 s for the whole ownership check.

## HARD RULES #33 and #34 (2026-11-12)

The owner's order on 2026-11-12: every red or flaky test fixed, at its root, with no follow-ups and no exceptions, and
rules so a flaky test is never created and never left. #32 already said how a test should be written. What it did not
stop was the habit that let the Studio E2E nightly stay red on `main` for weeks: each session that met a red test
showed it was red on `main` too, wrote a `followups.d/` note, and moved on. The last scheduled run before the order,
43017679054 on 2026-11-11, reported 31 failed and 3 flaky tests across all eight shards, and many of them already had
a note and no fix.

- **#33 owns the encounter.** Whoever meets a red or flaky test fixes it, on its own branch from `main` so the fix does
  not ride in a feature diff (#8, #17). "Red on main too" proves you did not cause it, which is #18's question, not who
  fixes it; for tests, #18's off-path follow-up exit is closed. Meeting includes the first session after a red nightly
  or platform-suite run, because the nightly is where #2035's failures lived and no session ever ran it. The only exit
  is switching the test off (or deleting it), and only with a three-part reason: what was tried, evidence a reviewer
  can open (a run URL, a trace file, `#N`), and what would re-enable it. Re-running a job the runner lost before any
  test reported (`platform-suites-supervisor.yml`'s one re-run, gated on its `infra` verdict) is not a retry.
- **#34 owns the evidence.** A new test, or one whose assertion or wait changed, shows a red run (a failing arm),
  repeat green alone and green under load, on one project. A rename or a selector-only edit owes only the failing arm,
  so a small change does not pay thirty e2e runs. The retry goes to 0, because a retry is how a flaky test reads as
  green.

**What the gate holds.** `checkFlakyTests` gains two shapes. `disabled-test` counts a test switched off by a literal,
whatever the machine: `{ skip: true }`, `{ skip: 'why' }`, `test.skip('title', fn)`, Playwright's
`test.skip(true, 'why')`, a bare `test.fixme()`, `describe.skip`, `.todo`. A skip that depends on a value, such as `test.skip(browserName !== 'webkit', …)` or
`{ skip: skipWithoutChrome(chrome) }`, scopes a test to the machines it can run on, and is not counted. `focused-test`
counts `.only`. Both are budget 0 and are never baselined, because a baseline of switched-off tests is the backlog #33
forbids.

**A third shape, `env-skip`, for node tests.** A skip whose value depends on the machine (`{ skip: !fs.existsSync(B) &&
'not built' }`, `return t.skip('no Chromium')`) is not disabled everywhere, but `node --test` reports it as a pass, so
a CI job that lost its tool reads green. It must go through a helper that fails under CI (`skipWithoutChrome`, or the
general `skipUnlessCI(missing, reason)` in `test/helpers/chrome.js`), or carry `// ci-skip: <which job runs it, or why
CI never takes this branch>` right above it. Day one held 94, baselined like #32's shapes so the count only falls.
`docs/e2e` is out of scope: there `test.skip(cond, …)` scopes a test to the projects (engines, widths) it can run on,
and each project is an explicit CI target. The gate reads literals: `if (!tool) test.skip(true, …)` counts as disabled,
and moving the condition into the first argument is review's question, not the gate's.

**What the first run found.** Fourteen tests in twelve integration files skipped themselves with
`test('SKIPPED — no Chromium available', { skip: true }, …)` behind a local copy of the Chromium resolver.
`node --test` reports a skipped test as passing, so a CI runner that lost its browser would have shown those suites
green. `test/helpers/chrome.js` already solved this (`skipWithoutChrome` fails in CI), and #1674's three silent gates
were the reason it exists. All twelve files now use it, and the gate keeps the hand-rolled form out. Three e2e lines
used `test.skip(true, …)`: two when `pdftoppm` was missing (every other PDF spec already requires it, and CI installs
poppler-utils), one when no gallery tile showed a variant-looks toggle, which is the regression that test exists to
catch. All three now fail instead.

**Retries go to 0 now, not after the drain.** The per-PR smoke job already ran with `--retries=0`
(`.github/workflows/ci.yml`), so the config's `isCI ? 1 : 0` only ever hid flakes in the nightlies. `checkPlaywrightRetries`
holds `retries: 0`, project overrides included.

**What no gate can hold.** Whether a failing arm was really run, whether "under load" really loaded the machine (and
local `--workers=4` on a large machine is not CI's two workers on a small runner; the nightly at `retries: 0` is the
detector for that), and whether a `// disabled:` reason is true. The gate only checks its shape. Review holds those, with the evidence in the PR body.

## Not decided here

- Whether a deadline in an e2e spec (F4) gets a gate of its own. It needs a runner-speed model this note does not have.
- How to rewrite each test. That is the audit's work, file by file, in `followups.d/3045-p1-flaky-test-audit.md`.
