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

**The gate counts three shapes** in every committed test file: every `*.test.*` and `*.spec.*`, and every file under
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
the tick of a polling loop, and a timing that is logged and never asserted are the cases seen so far. The reason is
required; a bare `flaky-ok` still counts.

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

## Not decided here

- Whether a deadline in an e2e spec (F4) gets a gate of its own. It needs a runner-speed model this note does not have.
- How to rewrite each test. That is the audit's work, file by file, in `followups.d/3045-p1-flaky-test-audit.md`.
