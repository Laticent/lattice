# Gotchas — CI and the cloud sandbox

One topic of the gotchas. Find a symptom in the generated index, `dist/engineering/gotchas.md`;
this file is the detail. Entry shape and the rule for adding one are in the [guide](../gotchas.md).

## The `CodeQL` check reports a verdict BEFORE its `Analyze` jobs finish

- **Symptom:** A push lands, the `CodeQL` check goes red within seconds naming a
  security alert, and the alert points at code that does not exist — a line
  number landing on test data, or on a construct you already removed. You "fix"
  it, push, and the same red check reappears against the new head.
- **Cause:** `CodeQL` is an aggregate check run, not a job. It is posted early
  and summarizes the alerts *known at that moment*, which on a fresh push are the
  ones uploaded by the PREVIOUS commit's analysis. The jobs that actually
  recompute them — `Analyze (javascript-typescript)` and friends — are still
  running, and finish a minute or two later. Observed on #1427: the `CodeQL`
  check started 11:18:27 and concluded `failure` at 11:18:30, while the two
  JavaScript analyses ran until 11:19:34 and 11:19:45. The check was never
  refreshed afterwards.
- **How to tell:** compare `completed_at` on the `CodeQL` check against
  `completed_at` on the `Analyze (…)` jobs. If the check finished first, its
  verdict predates the evidence. A three-second `CodeQL` check is always stale.
- **Fix:** wait for every `Analyze` job to complete before reading the check, and
  before changing anything read the annotation's file at the reported line. A
  successful `Analyze` run with no matching code in the diff means the alert is
  from the previous head. `rerun_workflow_run` will NOT help — a run whose jobs
  all succeeded cannot be retried, so the only way to refresh the aggregate is a
  new commit.
- **Cost of not knowing this:** four force-push rounds on #1427, three of them
  chasing an alert that had already been fixed. The general rule it belongs to is
  the same one the two-pass bench gate encodes: **a check-run conclusion is not
  evidence until its inputs have completed.**
- **Triggered by:** #1427.

## Rendering in the cloud sandbox needs `CHROME_PATH`

- **Symptom:** Rendering a deck in a Claude Code on Web session fails
  with "No suitable browser found. Please ensure one of the following
  browsers is installed: chrome, edge, firefox." A new session might
  conclude no browser is available and skip rendering entirely.
- **Cause:** marp-cli's browser auto-detection looks in the standard
  system locations (`/usr/bin/google-chrome`, etc.) and doesn't know
  about the puppeteer-cached chromium the sandbox ships with. The binary
  IS present at
  `/root/.cache/puppeteer/chrome/linux-<version>/chrome-linux64/chrome`
  — marp-cli just can't find it on its own.
  **The owned emulator is not in that boat and has not been for a while**:
  `detectChromeExecutable()` scans that exact cache itself, which is why
  rendering works in a fresh session whether or not you export anything.
  This entry used to name the owned engine as a second victim; it was
  wrong, and it hid a real defect underneath (below).
- **Mitigation:** export `CHROME_PATH` before rendering — required for
  marp-cli, belt-and-braces for the owned emulator (which finds the same
  binary itself):

  ```bash
  CHROME_PATH=$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome | sort -V | tail -1) \
    node dist/lattice.js <deck>.md <deck>.pdf
  ```

  `sort -V | tail -1`, not `head -1`: a cache that has accumulated two
  builds must hand over the same one the emulator's own scan would pick,
  which is the NEWEST. Every resolver in the tree agrees on that as of
  #2088; before it, half of them picked the oldest and it did not matter
  because the value never reached the renderer.

  The integration test helper at
  [test/helpers/render.js](../test/helpers/render.js) inherits
  `process.env`, so the same env var works for tests too. If you
  install marp-cli yourself (`npm install @marp-team/marp-cli`) to
  render an Export-to-Marp bundle — marp-cli is **no longer bundled**
  (P4 retired it as a render path; the owned engine renders every
  first-party path) — the identical `CHROME_PATH` discovery issue
  applies to that `npx marp` invocation.
- **Triggered by:** any marp-cli render in a fresh cloud-sandbox session.
- **The defect this entry hid (fixed, #2088).** `CHROME_PATH` reached the
  owned renderer through nothing at all: `detectChromeExecutable()` read
  `PUPPETEER_EXECUTABLE_PATH`, then the cache, then `which` — never
  `CHROME_PATH`. The command above worked by coincidence, on the cache
  scan, while the variable it sets did nothing. Measured both ways:
  `CHROME_PATH=/nonexistent/chrome` rendered a deck fine, and with the
  cache made undiscoverable a *correct* `CHROME_PATH` still failed while
  `PUPPETEER_EXECUTABLE_PATH` to the same file rendered. The emulator now
  reads `CHROME_PATH` — after `PUPPETEER_EXECUTABLE_PATH`, and only when
  it names a file this process may execute, so a stale or decorative
  value still falls through to the cache scan instead of becoming a new
  render failure. Pinned by
  `test/integration/export/chrome-path-resolution.test.js`.
- **Removable when:** the sandbox ships chromium at one of the canonical
  system paths, or nothing here uses marp-cli. The puppeteer-cache half
  of this entry is already obsolete for the owned engine.
- **Commits:** documentation, then #2088 for the `CHROME_PATH` half.

## A generated `dist/` artifact goes "stale" after a rebase, and that is not a defect

- **Symptom:** You rebase on `origin/main` (HARD RULE #16 asks for it when
  the branch conflicts with `main`), run the unit suite, and a test fails
  saying an artifact is stale — naming a subsystem you never touched. Meanwhile
  `npm run build:check` says every artifact is up to date, so two gates appear to
  contradict each other over the same file. (Pre-push ran the unit suite until
  2026-10-06, so this used to block the push itself, and `--no-verify` is banned
  by HARD RULE #14.)
- **Cause:** `dist/` has been gitignored since #1742, so everything in it is
  whatever your last local build wrote. The SessionStart hook builds once, at
  session start. Any source that arrives afterwards — a rebase, a `git pull`,
  your own edit — leaves the artifacts behind the sources, and a test that
  recomputes from current sources and compares to disk then differs for a reason
  that has nothing to do with your change.
- **The fix is a FULL `npm run build`. Not `npm run css:build`.** This is the
  part that costs a second round: `css:build` refreshes `dist/lattice.css` and
  `dist/lattice-min.css` and stops there, while `dist/marp-kit/` is built by a
  later step from `dist/lattice-min.css`. Run it alone and you trade one stale
  artifact for an internally *inconsistent* `dist/`, and
  `test/unit/tools/marp-kit.test.js` goes red instead — same shape, one artifact
  over. An independent reviewer of #1783 hit exactly this, following an earlier
  version of this entry that recommended `css:build`.
- **Note what the SessionStart hook actually runs.** `.claude/hooks/session-start.sh`
  runs a full `npm run build`, with stdout and stderr discarded and `|| true` so a
  failure cannot abort the hook. `node tools/build.js --only-uncommitted` is
  reached earlier and separately, as the `prepare` lifecycle of that script's
  `npm install`, and the full build supersedes it. So there are two ways to end a
  session start with a partly-built tree: sources moving afterwards, or that full
  build failing behind a one-line notice.
- **`--only-uncommitted` is NOT a second producer,** which is where this wastes
  the most time — #1783 was filed on that reading. `build-css.js main()` writes
  `bundle()` verbatim to `dist/lattice.css`, the same step runs in both modes, and
  the two emit byte-identical CSS from the same sources. Only the clock differs.
- **Why the two gates disagreed, and why both were right:** `build:check` runs
  `--exclude-uncommitted`. It deliberately does not look at `dist/`, because
  `dist/` is generated rather than committed and so is not what that gate is
  asking about.
- **How to tell:** the delta is entirely content from commits you just pulled in.
  On the instance that produced this entry, `bundle()` returned 1,595,126
  characters (1,636,862 bytes — the numbers `.length` and `wc -c` give you differ,
  and this file is full of multi-byte punctuation) against 1,594,354 on disk. The
  whole 772-character difference is one hunk of
  `lib/plugins/chart-family/kinds/journey/journey.styles.css` that `fbb6287` changed: a
  nine-line comment added above `section.journey .journey-mood-key-label`, less
  the `opacity: 0.85` line the same commit deleted from the rule.
- **What checks this properly, and where:** `npm run build:check:all` runs in
  CI's `unit` job right after the full build, re-running all 39 generators' own
  `--check`. It is meaningful *only* there, and it is the one CI gate that looks
  at the 25 built-not-committed artifacts. Do not confuse it with the `lint`
  job's `build:check`, which asks the opposite-facing question ("did you commit
  the regenerated artifact?"), must therefore run *before* any build, and skips
  `dist/` entirely via `--exclude-uncommitted`. By hand, `npm run css:check` is
  the same question narrowed to the CSS, in about half a second. A unit test
  asking it was removed in #1783: vacuous in CI, which full-builds first, and
  spuriously red locally after any rebase.
- **What `build:check:all` does NOT catch — and don't "fix" it:** it delegates to
  each generator's own `--check`, and some are deliberately weaker than a
  byte-diff. `build-decisions-index` asserts every note has one correctly-formatted
  row rather than comparing to a regeneration, which is what lets two decision-doc
  PRs share the merge queue (#1547); `build-component-docs` checks an *authored*
  `*.gallery.md` for existence only. Both were measured: reversing the index's sort
  and appending to an authored gallery each leave the gate green. Rebuilding the
  tree and git-diffing it would catch them and has already re-opened #1547 once.
  A generator wanting a true byte-diff says so in its own `--check`.
- **Triggered by:** #1783, found while pushing #1779.

## A `vi.doMock` intermittently loses to the file's hoisted `vi.mock` — under LOAD, not under shuffle

- **Symptom:** A docs test that `vi.doMock`s a private stub over the file's hoisted
  `vi.mock` passes alone and passes most whole-file runs, then fails perhaps 1 run in 6
  once the machine is busy. It reports a plausible PRODUCT regression — in
  `read-aloud.test.ts` (:408) the read-aloud loop appeared to start before the voice
  model resolved, `active` reading `{cueIndex: 0, wordIndex: 1}` where the test demanded
  `null`. Measured 5 failures in 30 whole-file runs under 6 CPU hogs on 4 cores; 0 in 12
  when filtered to that one test.
- **Cause:** the dependency is reached only through a DYNAMIC `import()` deep inside the
  module under test (`read-aloud.ts`'s `getVoice()` singleton), and that import is
  intermittently served the file's HOISTED stub rather than the `vi.doMock` registered
  moments earlier in the test body. The hoisted stub returns its model synchronously, so
  the window the test meant to hold open — a voice load in flight — never opened: the hook
  armed at once and the estimate advanced, exactly as a real regression would look.
  Same "only a dynamic import can see the registry change" property as the `doUnmock`
  mechanism above, reached from the other direction.
- **How to tell it apart from a real regression, in one reading:** find a value the two
  stubs disagree on and print it in the assertion message. Here it was `rung` —
  `'silent'` on every failing run (the hoisted stub's value) rather than the `'kokoro'`
  the private mock returns. That one field also ruled out the other candidate: a REJECTED
  dynamic import would take `getVoice()`'s `.catch(() => null)` path and leave `rung`
  `null`, which is not what any failing run showed.
- **Fix — do not race the registry, remove the need for a second registration.** Put the
  control on the file's OWN stub (`voiceState.gate`: a promise the stub resolves its model
  behind, null for every other test) and drop the `doMock` entirely. Whichever
  registration wins is then the same factory, and both honor the gate. Assert the premise
  too: count the stub's constructor calls and require it to have run, or an environment
  that never started the load satisfies the negative assertion for the wrong reason.
- **Don't reintroduce:** a `vi.doMock` over a hoisted `vi.mock` for anything the module
  under test reaches by dynamic `import()`. Parameterize the hoisted stub instead.
- **Triggered by:** the flake #2028 hit as a red docs-build; fixed alongside #1554.

## A docs test passes in declaration order and fails under `--sequence.shuffle.tests`

- **Symptom:** A `docs/` test file is green in every ordinary run and red the
  moment test order is shuffled — `npx vitest run <file> --sequence.shuffle.tests
  --sequence.seed=11`. It reproduces on the file ALONE in seconds; no full run is
  needed. The failure text is an element that cannot be found, or a boolean that
  is the exact opposite of what the test set up.
- **Cause:** Three mechanisms, each of which makes a case silently depend on a
  sibling having run first. Neither is the cross-file state leakage the flaky-docs
  cards hypothesize — these are *intra*-file, deterministic given a seed, and a
  different class from the load-dependent timeouts in
  `engineering/decisions/2026-08-23-jsdom-suite-timeout-budget.md`.
  - **`vi.resetModules()` does not reach the MOCK registry.** A hoisted `vi.mock`
    factory is evaluated once and its result cached for the whole file, so a case
    needing an import to FAIL gets the previous case's successful resolution back.
    `vi.doMock` in `beforeEach` re-registers the factory per test — it is not
    hoisted, so it runs *after* `resetModules` — giving each case a fresh module
    under test AND a fresh dependency resolution.
  - **`React.lazy` memoizes on a module-scope object.** The Studio code-splits its
    heaviest panes ([StudioShell.tsx:113](../docs/src/components/studio/StudioShell.tsx)
    `Fabricate`, `:127` `Editor`, `:137` `ComposeView`). Only the FIRST case in a
    file to mount one pays the cold Vite transform and sees the Suspense fallback;
    every later case finds it resolved. So a synchronous `getByLabelText('Deck
    source')` or `getByRole('button', { name: /Component/ })` passes or fails on
    which case vitest happened to schedule first — in `studio.controls` that was
    49 of 50 green and whichever drew the short straw red.
  - **`vi.doUnmock` removes the file's HOISTED mock too**, not just the local
    `vi.doMock` it was written to undo — the registration is keyed by resolved
    path, and `doUnmock` deletes the entry rather than popping a layer. This is
    the INVERSE of the first mechanism and it was `read-aloud.test.ts`'s (#1814,
    fixed). **It only bites a dependency reached by DYNAMIC `import()`**, which is
    why it can hide for so long: a static import is bound once at file load, while
    `read-aloud.ts` reaches `voice-model.js` only through `import()` (its
    `getVoice()` singleton, `listTtsCatalog`, `listTtsModels`), so each call
    re-resolves against the *current* registry and quietly got the REAL module.
    The failures read as a spy called 0 times or a highlight that never advanced —
    they do not look like a mocking problem at all. The fix is to **restore**, not
    unmock: extract the hoisted factory to a named `function` (declarations hoist,
    so `vi.mock`'s own hoisting still finds it) and `vi.doMock(path, thatFactory)`
    in `afterEach`. Note that *not* cleaning up is not an option either — the local
    `doMock` would then outlive its describe.
  A file's own comments can point at the wrong one of these: `read-aloud.test.ts`
  blamed the module-level singleton in `read-aloud.ts`, which is the reason those
  describes call `vi.resetModules()` at all but is NOT what leaked across cases.
  Attribute by mutation, not by reading — breaking each of that file's two restores
  separately reproduced exactly one of the two failing seeds each (999 → 10 failed,
  3001 → 8 failed), which is what proved both load-bearing and the singleton a decoy.
- **Do NOT read a red full-suite shuffle run as "another ordering bug".** All three
  mechanisms above are *intra*-file and DETERMINISTIC given a seed, so the diagnostic
  that separates them from everything else costs seconds: **run the one file alone at
  that seed.** If it is green alone and red in the suite, ordering is not your
  problem — you are looking at the separate load-dependent `asyncUtilTimeout` flake
  (#1324/#1471), which is intermittent, moves between tests run to run, and **appears
  in UNSHUFFLED runs too**. Measured while closing #1814: four consecutive full runs
  failed a *different* test each time (`studio.findings-fix` ×2, then
  `studio.controls` "deterministic Coach chips"), and the last of those was on clean
  `main` with no shuffle flag at all. So one green full shuffled run is not evidence
  the suite is order-independent, and one red one is not evidence it isn't; the
  per-file runs are what carry the claim.
- **A `setup()` that awaits NO boundary leaves the first cross-boundary wait exposed.**
  The helpers below work because every later read finds the pane already resolved — so the
  budget only has to live on the ONE wait that crosses the split first. A file whose
  `setup()` merely renders (`StudioShell.test.tsx`) has no such wait, which makes whichever
  assertion happens to touch Fabricate or the Editor first the one paying the cold transform
  on the 1000 ms default. That file was a third member of the #1471 flake pool, named in
  neither that card nor #1324, and surfaced once in 20 full runs — so when you budget one of
  these, check whether the file has a helper doing it for you or whether the raw assertion is
  the boundary.
- **Mitigation:** Wait for the pane in the shared setup helper (`editorReady`,
  `openFabricate` in
  [studio.controls.test.tsx](../docs/src/components/studio/studio.controls.test.tsx)),
  with an **explicit** per-call budget rather than Testing Library's 1000 ms
  `asyncUtilTimeout` default. That wait is not waiting on a state update — it is
  waiting on Vite transforming CodeMirror, measured at **420 ms cold / 46 ms warm
  idle but 1070–1424 ms cold under 2x CPU oversubscription**, i.e. over the
  default on every contended run. #1806 characterizes this class and asks for
  exactly this narrow per-call fix instead of a global bump; note its "the only
  one waiting on a `React.lazy` boundary" refers to the *Fabricate* wait, which
  stays under 600 ms because it resolves a much smaller module than the Editor.
- **Worth knowing:** a mocked dependency's cache also makes call-COUNT assertions
  lie in the other direction. A repeat `import()` of an already-resolved module is
  a registry cache hit that never re-runs the factory, so a counter incremented
  inside the factory cannot see a loader that lost its memo entirely — that
  assertion was vacuous and passed under mutation. Count namespace reads through a
  getter instead.
- **A `docs/` TYPE error still passes the docs vitest suite — but the pre-push
  hook now catches it.** As of the `docs-typecheck` job, pre-push runs
  `tsc --noEmit` over the docs workspace whenever a push touches `docs/`
  (~36-40s; skipped otherwise). Before that job existed, pre-push ran only
  `lint`, `lint:deck:all`, `build:check` and the root `npm test` — **none of
  which typecheck `docs/`**, because biome does not typecheck and vitest strips
  types via esbuild without checking them, so the error first appeared as a red
  required check in CI's `docs-build`. Two things that have NOT changed: the
  docs **vitest** suite still runs only in CI, and the new job is scoped to
  `docs/` pushes, so a root-`lib/` change that breaks docs types (docs imports
  root `lib/` directly) still reaches you only via CI.
  The case that motivated the job: making one `setup()` helper `async` silently
  retyped four sibling helpers declared `user: ReturnType<typeof setup>` as
  `Promise<UserEvent>` — invisible to every test run, because it is types-only.
  The fix is `Awaited<ReturnType<typeof setup>>`; the lesson that outlives it is
  that a green `npm test` is not evidence about `docs/`.
- **Triggered by:** Any run with `--sequence.shuffle.tests`; otherwise latent.
  Found while working #1324.
- **Removable when:** Nothing upstream — this is a test-authoring hazard, not a
  dependency defect.

## A Playwright test for a settling-round race passes on the broken code

- **Symptom:** You fix a race where an async round lands *behind* a user action and wipes what it
  produced, then write a real-browser test for it — per HARD RULE #23, since the claim is about
  what a person sees. The test passes. It also passes with the fix reverted.
- **Cause:** In a real browser the round has already settled by the time a click can land. The
  ordering that produces the bug — click first, round second — needs the round held open, and
  nothing in a real page lets you hold it. Measured while porting the Coach quick-read fixes: a
  Playwright test that clicked a chip and then waited for the assessment to complete passed
  identically against the shipped fix and against the pre-fix unconditional clear.
- **What to do instead.** Pin the ORDERING in jsdom, where the round can be hand-released — the
  pattern in `docs/src/components/studio/studio.coach-card-race.test.tsx` (#1840) and
  `studio.coach-card.test.tsx` (the chip's own in-flight window). Spend the real-browser test on a
  claim a browser can actually falsify: a rendering, a layout, a control that must exist. Splitting
  it that way is not a concession — a real-browser test that cannot fail is worse than no test,
  because it reads in the PR as the strongest evidence in the diff.
- **This bans the ORDERING claim, not the whole surface — read it that way.** The Coach chips DO
  have real-browser coverage now: `@smoke the Top fixes quick read does not congratulate a deck
  nobody assessed` in `docs/e2e/architect.spec.ts` drives a chip in Chromium and **fails when the
  honesty guard is reverted** (mutation-checked both ways, not read). The line between the two is
  not "unit vs e2e", it is **what the claim is about**: an ordering claim needs a round held open
  and no real page lets you hold one, while a STEADY-STATE claim — what words are on the card once
  everything has settled — is exactly what a browser is good at. Before writing either, ask which
  kind you have.
- **Getting a settle signal for free: start from the OTHER state and transition into it.** The
  jsdom file seeds the class-less deck into `localStorage` and then has no signal to wait on — the
  "Add a slide or two" placeholder renders from the first frame (`deckHasContent` starts false), so
  waiting for it proves only that the component mounted, and that file falls back to a bounded
  1200 ms sleep. The e2e starts on the assessed built-in deck and types the `_class` directives
  away, which turns the same placeholder into a **transition** that can only appear after a
  completed round set `deckHasContent` false — and `setAssessing(false)` is published in the same
  React batch, so `assessing` is provably false too. Same assertion, no sleep. It also sidesteps
  the seeding trap: `lattice-studio-src-<deckId>` is `JSON.parse`d behind a `try`, so a raw string
  degrades silently to the built-in deck, which HAS `_class` directives — the test would then pass
  while exercising the opposite of its name.
- **The tell:** before believing any test that covers a race, revert the fix and watch it fail.
  If it still passes, it is pinning the harness rather than the defect. This applies with more
  force to e2e than to unit tests, because e2e is slow enough that nobody re-runs it idly.
- **Triggered by:** Porting the #1471 work onto #1840.
- **Removable when:** Nothing upstream — this is a property of real browsers.

## An integration test that asks the export to BEAT a timer ejects PRs from the merge queue

- **Symptom:** A test passes locally every time — 5/5, 20/20 — then fails once inside a merge
  group, taking an unrelated PR out of the queue with it. The failure names content that was
  supposed to be absent from an artifact and is present, or a warning that was supposed to be
  printed and is missing. Re-running locally reproduces nothing.
- **Cause:** the assertion is a **wall-clock race the export has to win**, and a merge-queue
  runner is contended enough to lose it. `test/integration/export/author-script-deferral.test.js`
  asserted that a deck-authored `setTimeout(…, 400)` had NOT fired before capture. The window it
  had to beat is everything between the script parsing and `page.pdf()`. **Measured (#1835):**
  125/245/335 ms across three runs on an *idle* sandbox — 65 ms of headroom in the worst of
  three, with 210 ms of spread on a machine doing nothing else. Six concurrent renders push it
  to 450-941 ms, where the timer wins **4 times in 6**. That is how it ejected #1824.
- **It fails in BOTH directions at once,** which is why it reads as two unrelated bugs: when the
  timer wins, the content lands in the artifact *and* the probe's record settles, so no warning
  prints either.
- **How to tell it apart from an ordinary flake:** re-read the assertion and ask *what has to
  happen first for this to pass.* If the answer is "our code has to finish before a clock the
  test itself started", it is this. A duration in the fixture (`400`, `120`, `2000`) is the tell.
- **Fix: size the delay against the HARNESS's own timeout, not against a measured window.** The
  fixture's timer is 10 minutes against a 120 s `spawnSync` cap, so for it to fire the render
  would have to outlast the test itself — load can no longer decide the verdict, and a
  pathological render fails loudly as a timeout instead of quietly as a wrong assertion. That is
  what makes it *structural* rather than merely a wider tolerance, and it is the distinction to
  preserve if anyone retunes it. Make the harness message name the signal and `ETIMEDOUT`, or
  that branch surfaces as an unexplained `null !== 0`.
- **Do NOT "make it safer" by raising the delay much further.** The delay goes through IDL
  `ToInt32`, so behavior is **modular, not monotone** — only `[1, 2147483647]` means what it
  says. MEASURED identically in Chrome 131 (the build puppeteer bundles, i.e. the one the export
  runs) and Chromium 141: `2147483647` and `600000` do not fire, `2147483648` fires at **0 ms**,
  and `4294967696` (2³² + 400) fires at **400 ms** — silently restoring the exact race. "Past the
  clamp, bigger means immediate" is the wrong rule and hides the hazard.
- **What the fix COSTS, and you must say so.** The old delay was also the only thing detecting a
  **bounded wait added before capture**: inject `await sleep(5000)` ahead of the probe read and
  every case stays green now, where the 400 ms fixture caught it. That claim is inherently racy —
  a statement about a duration on a machine whose speed is not ours — so it cannot be made
  reliable, only deleted. Deleting it is right; leaving the file implying it still holds is not.
- **A large delay also strands the settle-on-fire path.** With no timer that ever runs, the
  probe's `invoke`/`settle` is unreachable in a real browser, so a record left open after its
  callback ran — a false-positive warning on every deck whose timers fire — stays green. Keep one
  `setTimeout(…, 0)` case that asserts its text LANDS and that no warning names its slide: that is
  race-free in the safe direction, since contention only makes it more certain to pass.
- **Triggered by:** #1824's ejection; fixed in #1835/#1843, hardened after.
- **Removable when:** Nothing upstream — this is a test-authoring hazard.

## Every Dependabot PR in a directory is red, and `npm ci` blames a package none of them touched

- **Symptom:** four or five Dependabot PRs against the same directory all fail the same jobs, on
  `npm ci`, with an error naming a package that appears in none of their diffs:

  ```
  npm error code EUSAGE
  npm error `npm ci` can only install packages when your package.json and
  npm error package-lock.json … are in sync.
  npm error Missing: proxy-agent@8.0.2 from lock file
  npm error Missing: agent-base@9.0.0 from lock file
  …
  ```

  Locally everything is fine: `npm ci` passes on `main`, `npm install` passes, and regenerating
  the lockfile by hand always produces a working one. `@dependabot recreate` changes nothing —
  the head does not move and the checks stay red.
- **Cause:** the committed lockfile holds a node that **only an optional peer dependency reaches**,
  and npm and Dependabot disagree about whether such a node exists. npm materializes an optional
  peer whenever it can resolve one; Dependabot's lockfile writer does not. So Dependabot's
  regenerated lockfile is missing that node and everything under it, and `npm ci` — which
  validates the lockfile against itself before resolving anything — refuses it.
- **This is NOT a peer CONFLICT,** and that is the whole reason it costs weeks. A conflict says
  `ERESOLVE` and names two incompatible ranges. This says `Missing: <package> from lock file`, so
  it reads as a problem with the named package — in #1491 that was `proxy-agent`, reached through
  `puppeteer-core`, on a PR whose entire diff was `brace-expansion 1.1.15 → 1.1.18`. Four /docs
  PRs sat red for three weeks behind that misreading, filed against an astro/Starlight peer pin
  that was real but blocked only ONE of them.
- **How to confirm it, and DON'T re-derive it:** npm already writes the answer into the lockfile.
  It marks each node it placed with `"peer": true` when a peer edge put it there and
  `"optional": true` when that edge was optional, so the nodes at risk are exactly the ones
  carrying BOTH. Either flag alone is fine — `optional` alone is an optionalDependency (131 in
  `docs/` today, all kept), `peer` alone is a required peer (8, all kept). On #1489's parent
  lockfile npm flags 14 nodes `peer && optional` and Dependabot's regenerated lockfile deletes
  exactly those 14 — same set, no misses, no extras. `checkLockfileOptionalPeers` in
  `tools/check-ownership.js` is that one-line check plus a readable message.
- **Do not diff node counts instead.** It is the obvious by-hand test and it misleads twice. The
  count must be taken against the Dependabot branch's OWN parent (1183 vs **1197** on #1489, a
  drop of 14) — comparing against today's `main` adds unrelated keys that are just base staleness.
  And the missing keys do NOT all sit under one parent: 12 were under `puppeteer-core`, and 2
  (`proxy-agent-negotiate`, `quickjs-wasi`) were hoisted to the root of `node_modules` because
  nothing outside the deleted subtree needed them.
- **Fix: give the package a hard edge.** Declare it a direct dependency of that directory's
  `package.json`, at the version the optional peer already resolved to, then regenerate. It is
  not a new install — the package was already in the tree; declaring it hoists it to the root and
  npm drops the nested copy because the root one satisfies the peer range. Dependabot keeps
  direct dependencies, so this should not recur for that package — "should", because nobody here
  can run Dependabot's lockfile writer to prove it. What IS measured is the survival: regenerate
  with a peer-ignoring resolver (`npm install --package-lock-only --legacy-peer-deps`) and the
  declared copy is still there, where the undeclared one vanishes.
- **The hard edge is CONFIRMED, which the bullet above could only predict.** #1996 landed it on
  `main` on 2026-09-01. Dependabot regenerated three of the four blocked `/docs` PRs against the
  new base within the hour — #1484 (vitest 4), #1485 (typescript 7), #1486 (`@astrojs/react` 6) —
  and all three went fully green, `docs-build` and `studio-smoke` included, where every earlier
  run of the same three died on `npm ci`. That is Dependabot's own lockfile writer producing an
  installable lockfile for that directory, which is the one thing nobody here can run locally.
- **A PR whose RECREATE itself errors never moves, and needs the bump by hand.** #1489 is the PR
  the diagnosis was built on and the one the fix did not rescue. Dependabot answers every
  regeneration of it with "Dependabot tried to update this pull request, but something went
  wrong" — six times between 2026-08-10 and 2026-09-01 — so its head never left the base it was
  cut from and it never saw the fix. Another `@dependabot recreate` cannot clear that: recreate
  is the step failing. Make the bump yourself instead — `npm update <package> --package-lock-only`
  in that directory, which for `brace-expansion 1.1.15 → 1.1.18` was a three-line edit that
  installs clean under `npm ci`, against Dependabot's 3-added / 231-deleted version of the same
  bump. **Dependabot then closes its own PR, and that is measured rather than assumed:**
  #2002 carried the hand-made bump onto `main` at 17:01:23Z on 2026-09-01 and
  `dependabot[bot]` closed #1489 at 17:50:50Z — 49 minutes, on its own, with nobody
  touching the PR. So the hand-made bump is the whole remedy: there is no second step
  where somebody closes the superseded PR, and no need to wait for the nightly run.
- **The hard edge is not a universal remedy, and the gate's own advice says so.** Hoisting only
  absorbs the peer when the root copy SATISFIES the peer range. Two consumers wanting different
  majors leaves a nested copy that is still optional-peer-only, and the fix has to be worked out
  against what `npm ci` actually makes of Dependabot's output for that tree.
- **Regenerate SURGICALLY — `npm install --package-lock-only`, never a from-scratch delete.**
  Deleting the lockfile re-floats every version in it (233 top-level versions, 25 of them direct
  dependencies, when #1491's earlier astro attempt tried it). The surgical path moved one
  transitive dev-only version across 2,848 dependency edges.
- **Check the whole change is inert before shipping it.** The useful measure is not the node diff
  — relocating a package changes many keys — but the **resolved version per dependency edge**: for
  every (consumer, dependency name) pair, which version does it get, before and after. #1491's fix
  changed exactly one edge, while the node view of the same change reads 12 removed, 25 added and
  9 re-versioned in place — which is why the node view is the wrong instrument here.
- **Triggered by:** #1491; gated by `checkLockfileOptionalPeers` (`tools/check-ownership.js`, via
  `build:check`), tested in `test/unit/tools/lockfile-optional-peers.test.js`.
- **Removable when:** Dependabot's lockfile writer materializes optional peers the way npm does.

## The Studio E2E nightly is GREEN while specs fail — the signal is issue #1705, not the badge

- **Superseded in part (2026-10-08 and later):** the job now fails on purpose when specs fail
  (the `Fail the job when the Studio E2E suite failed` step, owner's pick, followups 2557-p3),
  and the rolling issue is **#2035**, not #1705, which is closed. Since 2026-09-22 every
  scheduled run is red for another reason: the run step hits its 45-minute `timeout-minutes`
  about a quarter of the way through the suite (2,118 tests on two workers on 2026-10-28; run
  40674917008 stopped at test 509). Since 2026-10-29 the suite runs in eight `e2e (shard K/8)` legs
  of about 273 tests each (owner's pick), and the `e2e-report` job joins their verdicts and owns the
  issue: a leg with no verdict counts as a failure. Read #2035 and the job log, not the badge, before
  calling a spec newly broken. The history below is kept because the inverted-step reading still applies
  to the sibling nightlies that swallow the exit code.
- **Current state (2026-11-04):** the shards finish, and the badge is honest. In the last 15 runs, 10 were red, 1 was
  cancelled and 4 were green. Each of the last 6 had 55–64 failing and 1–9 flaky project-tests. Most of those failures are
  real regressions tracked in #2035, not flakes (`engineering/decisions/2026-11-04-ci-flake-audit.md`).

- **Symptom:** `studio-e2e-nightly.yml` reports `conclusion: success` night after night, so
  `main` looks covered — and specs have been failing in it the whole time. Measured on
  2026-09-02: the last eight scheduled runs were all `success`, and every one of them had a
  failing suite. `vetrina-geometry.spec.ts:35` was red in **every** nightly comment on record
  (from 2026-08-18), `author-present.spec.ts` in every one from 2026-08-26 — its first nightly
  after the spec landed.
- **Cause, and it is deliberate:** the run step is written as
  `if npm run test:e2e -- --grep-invert @perf …; then echo "failed=false" …; else echo
  "failed=true" …; fi`. The `if` swallows Playwright's exit code, so the STEP succeeds
  whatever the suite did, and nothing downstream calls `exit 1`. The job conclusion is
  therefore a statement about the runner, not about the tests. The same shape is in the
  `e2e-ai` job and in the sibling nightlies.
- **Where the truth is:** the `Open / append regression issue` step, gated on
  `steps.e2e.outputs.failed == 'true'`, appends the failing spec list to the rolling issue
  **[#1705] `[studio-e2e] Studio E2E suite failing on main`**. So the real signal is
  whether that issue got a new comment for last night's SHA — and, positively, whether the
  `failed == 'false'` step that records a green ran at all.
- **Reading it from the API without downloading logs:** list the run's jobs and look at the
  `Open / append regression issue` step. `conclusion: "skipped"` means the suite passed;
  `conclusion: "success"` means it RAN, which means the suite failed. That one field is the
  fastest true read of a nightly, and it inverts the intuition — the step succeeding is the
  bad news.
- **Why it is built this way:** the workflow wants the report artifact uploaded and the issue
  filed on a failure, which a hard `exit 1` at the run step would skip. The cost is that a
  green badge cannot be trusted, and a session was nearly misled by exactly that: eight green
  runs argued the two red desktop specs must be new, when the nightly's own comment history
  showed them red from the day each landed.
- **So "is the nightly green again?" is not answerable from the run list.** Check #1705 for a
  comment on the SHA you care about; no comment for that night is the pass.

## The `ci` check is green on a PR whose test tiers never ran

- **Symptom:** the required `ci` check passes, and the run page shows `unit`, `integration`
  and `docs-build` all `skipped` on a diff that touches `lib/` or `tools/`. The CI-green
  beacon lists them under "skipped by the path filter"; nothing else says so.
- **Cause:** every test tier `needs: changes`. When `changes` does not succeed, GitHub skips
  its dependents, and the Verify gate read each `skipped` as "the path filter said no".
  Seen when `changes` got no runner at all (`runner_id: 0` in the jobs API, no log, canceled
  after 15-19 minutes queued): both attempts of #2524's PR run, and the queue groups for
  #2525 and #2535, both of which merged with no test tier run.
- **Now:** the `ci` job needs `changes` and fails unless it succeeded (2026-10-05).
- **The same gate passed a `cancelled` tier in the merge queue.** It accepts `cancelled`
  because `concurrency: cancel-in-progress` cancels a superseded PR run. A queue group runs
  on its own `gh-readonly-queue/…` ref, so nothing supersedes it, and there `cancelled` is a
  timeout or a hand cancel. In the 39 completed queue runs from 2026-09-29 to 2026-10-05,
  11 merged with `integration` cut off at its 25-minute cap. The gate now fails a
  `cancelled` tier when `github.event_name == 'merge_group'`.
- **On a PR run, too, since 2026-10-29.** A PR run passed every `cancelled` tier, so a shard
  cut off by its own timeout or by hand read green: #2494 and #2900 (a shard at its 25-minute
  cap) and #2909's `aa0302c` (shard 3/4 hung and cancelled at 23 minutes). The Verify gate now
  reads the PR's head with `gh api`: a `cancelled` tier passes only when the head has moved
  past the run's SHA (a newer push superseded it), and fails on the current head. If the read
  fails, the gate fails closed and says so. `test/unit/tools/ci-gate-cancelled-tier.test.js`
  runs the real step against a stub `gh`. `integration`'s cap went to 45 minutes in the same change,
  because the suite had outgrown 25 (the numbers are in `ci.yml`'s timeout block).
- **How to read a green `ci` you doubt:** list the run's jobs and look at `changes` first. A
  `changes` that did not succeed means every `skipped` below it is unproven.
- **What it costs:** a PR run superseded by a push while its `changes` is still queued now
  goes red on the old SHA. With `changes` waiting 15-19 minutes for a runner, that window is
  real. It brings back a little of the red-webhook noise
  `decisions/2026-06-14-drift-watch-rebase-thrash.md` removed, because the `changes` check
  runs before the supersession check and a no-runner cancel reads `cancelled` too. It is
  accepted because the alternative is a green check over no tests.
- **Triggered by:** #2524 (`followups.d/2524-p1-ci-path-filter-skipped-tiers-on-rerun.md`).
- **Removable when:** never; this documents the gate's contract.

## A PR that changes only markdown fails the route budget by a few bytes, and a local build reads +0

- **Symptom:** `docs-build` fails in `check:route-budget` with "this PR adds N bytes of eager JS
  vs main, and N of them are not free", N from 1 to 13, on a diff of markdown, `followups.d/`
  files and one code comment. The route is already over its soft target, so every byte is owed.
  A local build against the same base reads +0 on every route. Seen on #2749: studio +3, +3,
  then +13 and playground +1, +2, then −3 across successive heads, and the figures moved on
  commits that changed only markdown.
- **Cause: not found.** Ruled out: none of the changed text reaches a built chunk (the note's
  text, the new header and `os-sandbox` are absent from `docs/dist/_astro`, and
  `lib/core/code-sandbox.js` is not bundled); two docs builds at different markdown states gave
  byte-identical chunk sets (553 files); a root rebuild left every root `dist/` file identical
  (365 files); a build against the exact CI base (`a64ecd5`) read +0. CI's playground asset hash
  (`039cbdbab432`) differs from the local one (`77673e351d41`), so CI builds something the cloud
  sandbox does not. Also ruled out (2026-10-17), each by a build: the same commit built in a throwaway worktree and in
  the checkout (identical bytes on all five routes); a comment-only change to `code-sandbox.js`
  (same playground hash `77673e351d41` with and without it); `main` against `main` plus the PR
  merged in, the exact comparison CI makes (identical playground hash, and +0 on every metric of
  every route, 23 numbers); the same merge after running the docs typecheck and unit tests first,
  as `ci.yml` does (still +0). The build embeds no commit ID or timestamp (a grep of `docs/dist`
  for the commit and for ISO dates found none), so signing and time stamps are not in the bytes.
  The one per-build value in the bundle is the playground hash in `__LATTICE_ASSET_BASE__`; studio
  and playground embed it and the other three routes do not, which matches where CI reads a
  delta, but no local build produced a different hash. So the delta appears only on CI's runners
  and its source there is unknown.
- **Read the named files first (since 2026-10-19).** The gate now names the files whose gzip bytes
  moved, with content hashes fixed, on every `per-PR allowance` line with a nonzero delta and in the
  failure text ("Grew most …"). The base is measured by the same script, so the names compare like
  with like. The next markdown-only PR that reads a delta on CI names the chunk; write the cause
  here when one does.
- **Fix:** the gate's own remedy. Add `docs/route-budget.d/<slug>.md` with a `route: +N` line
  and a sentence, as `docs/route-budget.d/README.md` says. Read N from the failing log's
  `per-PR allowance` block, never from a local build. Say in the sentence that no growth is
  claimed and that the cause was not reproduced. Precedent: #2361 and #2548 declared the same
  kind of variation.
- **How to avoid the treadmill:** finish the markdown before you declare. Each push that edits
  the notes can move the number again. A push that changed only the declaration file passed on
  its next run (#2749, `8b05bcb`).
- **Triggered by:** #2749.
- **Removable when:** someone explains the delta. Then replace this entry with the cause.

## The CI-green beacon says green, but unit, integration and docs-build were canceled

- **Symptom:** a bot comment reads "`ci` workflow green for `<sha>` (ran: lint; cancelled: unit
  · integration · docs-build)" and "Every other check on this commit had also concluded
  successfully". Seen on #2749 at `1a17c46`.
- **Cause:** you pushed again. `concurrency: cancel-in-progress` canceled that run's tiers, and
  a PR run accepts a `cancelled` tier by design (see "The `ci` check is green on a PR whose test
  tiers never ran"). The beacon reports the old commit's lint and nothing else.
- **How to tell:** the list after "ran:" names fewer tiers than a full run (lint · unit ·
  integration · docs-build), and the SHA is not the PR's current head.
- **Fix:** ignore it and wait for the run on the head SHA. Never count it as evidence in a
  pre-merge card.
- **Triggered by:** two pushes close together.
- **Removable when:** the beacon stops posting for superseded commits.

## A red check names a commit that is no longer the PR's head

- **Symptom:** after you push a fix, a failure event for `ci` or `docs-build` arrives, and it is
  the same failure you just fixed.
- **Cause:** the old run finishes, or is canceled, after your push, and GitHub delivers its
  result late. `ci` is an aggregate: it reads red when a tier it lists failed, or when `changes`
  was canceled.
- **How to tell:** compare the event's `head_sha` with the PR's current head. In the `ci` job
  log, `changes=cancelled lint=cancelled …` is a superseded run. `docs-build=failure` with the
  other tiers `success` is a real failure, so read the `docs-build` job.
- **Fix:** act only on the run for the current head. Seen on #2749 (`5f3d824` after `1108d53`,
  `6384c73` after `8b05bcb`).
- **Triggered by:** pushing while a run is in flight.
- **Removable when:** never; it follows from run supersession.

## The pre-push hook throws in `lint:deck` on code you did not touch

- **Symptom:** `git push` fails in the pre-push hook with `lint:deck — TypeError:
  pillSlot(...).tryRead is not a function`, while lint and format pass and your diff is
  documentation.
- **Cause:** not proven. `npm run build` fixed it, which points at a `dist/` (built, not
  committed) that predates the commits your branch was cut from. Seen on #2747, after the branch
  was cut from an `origin/main` that was 56 commits ahead of the sandbox's last build.
- **Fix:** `npm run build`, then push again. Never `--no-verify` (HARD RULE #14).
- **Same family, other symptom:** after switching between branches, `npm run build:check` can
  say "stale: guide-player bundle (engine export)" on a branch with no code changes, even with
  your edits stashed. `npm run build` fixed it and changed no tracked file, so the committed
  bundle was right and the local build output was not. Do not commit anything from that rebuild.
- **Also:** the cloud sandbox's local `main` can be a stale snapshot, 50 commits ahead and 56
  behind. Cut branches from `origin/main` and do not reset local `main`.
- **Triggered by:** cutting a branch from a newer `origin/main` than the one `dist/` was built
  from.
- **Removable when:** `lint:deck` rebuilds or refuses a stale `dist/` on its own.

## `studio-smoke` is red or green on its own; the `ci` gate does not count it

- **Symptom:** `studio-smoke` is red while `ci` is green, or the reverse. On a markdown-only PR
  one e2e test fails.
- **Cause:** `studio-smoke` is advisory by design. The `ci` job's `needs` are `changes`, `lint`,
  `unit`, `integration`, `docs-build`, `docs-test` and `player-webkit`, and `.github/workflows/ci.yml`
  (around lines 975-982) says `golden-diff` and `studio-smoke` are "intentionally ABSENT" from
  them: they run and report, and they do not gate. It promotes into `needs` only after a nightly
  green streak (#800).
- **How to tell:** open the job and read the failing test. On #2749 `studio-smoke` failed on
  `51577ea` and `6010676` and passed on `f80571a` and `9ee7827`. Only the `6010676` failure's
  error was read: `docs/e2e/library-images-complete.spec.ts:67` timed out waiting for editor
  text (the editor still read `<!-- _class: collage -->## Site walk- te- `), and 115 other
  tests passed.
- **That test's flake is fixed.** It was CodeMirror's 75 ms interaction delay swallowing the Enter (#2817, which
  closed `followups.d/2649-p3`; the cause is in `gotchas/studio-playground.md`). A new repeat of that symptom is a
  regression of the fix, not the old flake.
- **Fix for a PR you are driving:** a `studio-smoke` failure does not block the `ci` gate, and
  a failure in a test your diff cannot reach is not yours to fix on that PR. Do not edit the
  test, skip it, or quarantine it there. Name the follow-up in your stand-down note. A failure
  in a test your diff does touch is real.
- **Triggered by:** an intermittent e2e test.
- **Removable when:** `studio-smoke` has joined the gate, or this entry is trimmed to the advisory rule.

## The build fails with `Could not resolve "@laticent/<package>"` after you cut from a newer `origin/main`

- **Symptom:** `npm run build` or `npm run build:check` aborts at "bootstrap step
  lattice-runtime.js failed" with `Could not resolve "@laticent/mosaico"`, naming files you did
  not touch (`collage.pack.js`, `logo-wall-pack.js`).
- **Cause:** `origin/main` gained a workspace package after your `node_modules` was installed, so
  the link under `node_modules/@laticent/` does not exist. Seen on the branch for this entry: the
  fix was `npm install`, which added one package.
- **Fix:** `npm install` at the repo root, then rebuild. This is the same family as the stale
  `dist/` in the pre-push hook: both come from branching off a `main` newer than the sandbox's
  last install and build.
- **Triggered by:** cutting a branch from `origin/main` after a PR that adds a workspace
  package has landed.
- **Removable when:** the SessionStart hook installs on a changed lockfile or workspace list.

## A jsdom test fails as `'test failed'` against the file, with no test named and no diff

- **Symptom:** a unit file that loads the runtime in jsdom fails in CI with only
  `✖ <file> … 'test failed'`, and passes locally every time. Seen once in the merge queue for
  #2786 (`test/unit/runtime/code-copy-surfaces.test.js`, run 39284743444).
- **Cause:** the dot reporter prints that for an uncaught exception or an unhandled rejection
  outside any test, never for a failed assertion, which prints its diff. Here, `w.close()` empties
  the document, the runtime's MutationObserver sees the change and asks for animation frames on
  the closed window, and `pretendToBeVisual` runs frames from a plain Node `setInterval` that the
  close does not clear (jsdom 29). The frame runs on the torn-down window, and jsdom's own error
  report throws `TypeError: Cannot read properties of null (reading '_location')` in Node. The
  runtime starts observing from a later timer, so the test only crashes when it closes the window
  after that timer, which happens on a slow runner.
- **Mitigation:** `closeQuietly` in `test/unit/runtime/code-copy-surfaces.test.js` refuses new
  frames and cancels the outstanding ones before `w.close()`. The file's last test collects every
  escaped error and prints its stack. Its `a window closed after the runtime starts observing` case reproduces the crash
  without the fix.
- **Triggered by:** a jsdom window with `pretendToBeVisual` that runs the runtime and is closed
  after the runtime's observer is live.
- **Removable when:** jsdom clears its animation-frame interval on `close()`.
- **Not only an escaped error:** a test process that dies prints the same line. An out-of-heap
  crash (`FATAL ERROR: … JavaScript heap out of memory`) and a `SIGKILL` both show as a bare
  `'test failed'` under the dot reporter, which drops the child's stderr. Re-run with
  `--test-reporter=spec` to see which.

## A jsdom walk over many documents keeps them all, by two different holds

- **Symptom:** a test that parses many documents in jsdom grows its live heap with every one,
  though it keeps no reference to them. `test/unit/core/prose-binding.test.js` held ~2.0 GB live
  after a full mark-compact by its last deck, and died as a bare `'test failed'` when its heap
  limit was lower (`--max-old-space-size=1500` reproduces it in about a minute).
- **Cause:** two holds, measured over the gate's first 150 decks (live heap after `gc()`):

  | windows | between decks | live heap |
  |---|---|---|
  | one, for the whole walk | nothing / a `setImmediate` | 715 MB / 715 MB |
  | one per deck, closed | nothing | 858 MB |
  | one per deck, closed | a `setImmediate` | 98 MB |

  **The first hold** is a listener leak in the selector engine. jsdom 29.1.1 gives each document a
  `DOMSelector` from `@asamuzakjp/dom-selector` 7.1.1 the first time it is queried
  (`querySelectorAll`, `matches`, `closest`). Its `Finder` constructor (`src/js/finder.js`,
  `_registerEventListeners`) adds 9 capture listeners (focus, keyboard, mouse) to the shared
  window. Nothing ever removes them, so the window holds every queried document. Measured on one
  window with 300 large documents: parsing alone frees them all; querying each one adds 2,700
  listeners and keeps 1,966 MB live; the same queries with `addEventListener` stubbed out free
  them all again. Found together with the session fixing flaky tests on another machine, whose
  heap snapshot showed the same 2.1 GB retained.

  **The second hold:** a dropped window, closed or not, stays alive until the event loop takes a
  macrotask turn (~0.9 MB each, with what it parsed). A microtask `await` is not a turn, and
  node:test runs synchronous tests back to back without one. Why the window waits for a turn is
  not pinned down: jsdom 29 makes no `WeakRef` on this path.
- **Fix:** a window per unit of work, closed with it, and a macrotask turn after each:
  `afterEach(() => new Promise((resolve) => setImmediate(resolve)))` when each unit is its own test.
- **Triggered by:** hundreds of jsdom documents in one test file.
- **Removable when:** dom-selector removes its listeners (or jsdom stops sharing the window) for
  the first hold; jsdom frees a closed window at once for the second.

## The root-install jobs fail with `Cannot find module 'yjs'` (or `lib0`, `y-protocols`) from a Tavola adapter

- **Symptom:** `lint`, `unit` and `preview` go red in about a minute, in `npm ci`'s `prepare` step, with
  `build-tavola-lib: tsc declaration emit failed` and `error TS2307: Cannot find module 'lib0/decoding'` (or
  `y-protocols/awareness`) pointing at `docs/src/lib/tavola/adapters/yjs.ts`. The same build passes on your machine and in the
  pre-push `build:check`.
- **Cause:** those jobs install the root workspace only, so `docs/node_modules` does not exist. TypeScript resolves a bare import by
  walking up from the file: on your machine it finds `docs/node_modules/yjs` first; in the job it must find the root's, and the
  root's `devDependencies` did not list the package.
- **How to tell:** hide `docs/node_modules` and rebuild: `mv docs/node_modules /tmp/hide && rm -rf docs/src/lib/tavola/dist &&
  node tools/build-tavola-lib.js; mv /tmp/hide docs/node_modules`. (The build says "already current" and skips unless `dist/` is
  removed first.)
- **Fix:** a package a Tavola (or any workspace library) entry imports goes in the root `devDependencies` at the same pinned version
  as `docs/package.json`, and in the lockfile. `trystero` is already there for the same reason.
- **Removable when:** the library builds resolve their types from the package they ship rather than from whichever install is nearest.

## Every job that installs a Playwright browser fails at setup with `Playwright does not support <browser> on ubuntu26.04-x64`

- **Symptom:** `studio-smoke` and `player no-JS (WebKit)` go red on every PR at once, in under a minute, with no test run. The `ci` gate goes red with them, because `player-webkit` is in its `needs`. The log ends at the install step: `BEWARE: your OS is not officially supported by Playwright; installing dependencies for ubuntu26.04-x64 as a fallback. Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.56.1! ... Playwright does not support webkit on ubuntu26.04-x64`.
- **Cause:** `runs-on: ubuntu-latest` moved to Ubuntu 26.04 on 2026-10-27. #2904's `studio-smoke` and `player-webkit` passed at 19:15 to 19:32 UTC that day; the first red run on #2909 was at 23:30 UTC. Playwright 1.56.1 (the browser pin, `docs/package.json`) has no `--with-deps` list for 26.04.
- **Fix:** the jobs that run `npx playwright install --with-deps` are pinned to `ubuntu-24.04` (`golden-diff` already was, for another reason). Nothing else in them changes.
- **How to tell it from a real failure:** the job log stops at `npx playwright install` and the Playwright report artifact is empty. A real test failure prints the failing spec.
- **Triggered by:** GitHub moving the `ubuntu-latest` label.
- **Removable when:** never, as a rule: since 2026-11-05 every runner is pinned to a named image (`checkRunnerPins`). Move to a newer image in its own PR, once the Playwright pin (and the pinned browser builds the goldens and `@visual` baselines depend on) supports it.

## `player no-JS (WebKit)` or an iOS undo job is cancelled at its limit with no test failed

- **Symptom:** `player no-JS (WebKit)` is cancelled at 25 minutes inside its install step, the log a stream of `Get:` and `Ign:` lines from `azure.archive.ubuntu.com`. Or an `ios-safari-undo` job is cancelled at 30 minutes after one or two devices passed. Either way no test failed, and a re-run often goes green, which is what makes it look harmless.
- **Cause:** two deadlines that depended on something the test did not control (`engineering/decisions/2026-11-06-flaky-tests.md`). The WebKit job ran `playwright install --with-deps webkit`, which apt-installed about 180 packages from Ubuntu's mirror on every run (F6): over 17 runs on 2026-11-10 the step took 36 s at the median, but 5 took over 2 min, 2 over 10, and one never finished. The undo suite ran an iPad, an iPhone and the Mac's Safari one after another in one 30-minute job (F4): a passing run took 25.4 min, about 3 min of probe per device and the rest simulator boots.
- **Fix:** WebKit and its packages come from GitHub's cache through `.github/actions/playwright-browsers` (`browsers: webkit`; it was `playwright-webkit` until 2026-11-11, when every browser and apt install moved onto the cache, see the next entry), which `apt-cache-warm.yml` and the WebKit nightly (`webkit-baselines-nightly.yml`) warm on `main`; Ubuntu's mirror is read only on a cache miss. The key carries the runner image's version and falls back to the previous image's entry; when those packages no longer fit the newer image (several pin each other's exact versions), `.github/actions/apt-cached/apt-cached.sh` repairs from the mirror with a `::warning::` and the cache saved under the new image's key fits. A warning on every run means the repair is not reaching the cache: delete the caches whose key starts `playwright-<ImageOS>-<arch>-<version>-webkit-` and let the nightly rebuild them. The undo suite is three suites, `ios-safari-undo-ipad`, `-iphone` and `-mac` (`DEVICES` in `docs/scripts/ios-safari/run.sh`), each with the whole job limit.
- **How to tell it from a real failure:** the log stops before any test output. Do not re-run it until green (HARD RULE #32): find which external fetch or which device ran long.
- **Triggered by:** a slow mirror, or a slow simulator boot on a hosted Mac.
- **Removable when:** the install no longer touches the network at all (a runner image with the packages baked in).

## Every integration shard fails in `apt-get install poppler-utils` with `Temporary failure resolving 'azure.archive.ubuntu.com'`

- **Symptom:** all four `integration (node 22, shard N/4)` jobs go red within a few minutes of each other, before any test runs. The log ends `E: Unable to fetch some archives` with `Temporary failure resolving 'azure.archive.ubuntu.com'`, exit 100. On 2026-11-11 it hit PR #3136 twice, about 35 minutes apart.
- **Cause:** DNS for Ubuntu's Azure-backed mirror names (`azure.archive.ubuntu.com`, `us.archive.ubuntu.com`) failed about half the time that day, from GitHub's runners and from an unrelated network alike. The step ran `sudo apt-get update && sudo apt-get install -y poppler-utils …` against Ubuntu's mirror on every run, with no cache and apt's defaults (no retries). The runner image reads its mirrors from a short list (`mirror+file:/etc/apt/apt-mirrors.txt`), and a DNS failure on the first one failed the step.
- **Fix:** every apt install in CI goes through `.github/actions/apt-cached`, and every Playwright browser through `.github/actions/playwright-browsers`: the `.deb` files come from GitHub's cache, keyed on the runner image and the package list, and the mirror is read only on a miss or a repair. Before any mirror call, `apt-cached/apt-setup.sh` writes a longer mirror list, in a measured order (`mirrors.edge.kernel.org`, `archive`, Princeton, then the Azure-backed `azure.archive` and `us.archive`, then `security`: on 2026-11-11 the two Azure-backed names failed DNS about half the time from a network unrelated to GitHub's, the others at most once in 20) and `Acquire::Retries "3"` with 30 s timeouts, and the script tries each mirror call three times (owner call, 2026-11-11). apt's timeouts bound one fetch, not a call, so on 2026-11-12 an `apt-get update` whose connection kept trickling sat 24 minutes in InRelease fetches until the job was cancelled (run 43162229732; three integration shards of #3144 did the same). Since then `apt-get update` and the package download each run under a hard 150 s deadline (`APT_DEADLINE`), each retry first rotates the mirror list (`apt-setup.sh N`; `security.ubuntu.com` stays last) so a stalling mirror is not first for every try, and the install itself runs apart from the network, from the downloaded `.deb` files only (`--no-download`), so a deadline never kills dpkg mid-configure. Worst case a mirror call now gives up in about 17 minutes (three tries of two 150 s phases, 15 s each to kill, 30 s of waits) and fails with its own message, instead of running silently until the job is cancelled. Those numbers came from a sandbox behind a proxy: `apt-mirror-probe.yml` times every listed mirror from a GitHub runner every four hours (`tools/apt-mirror-probe.mjs`: DNS lookup, first byte, download speed) and ranks the past week of runs in its summary, which is what the order should follow. Every download is computed against dpkg's package list as it was before the job's first install, so an entry holds what the runner image lacks whatever ran earlier in the job; a failed run leaves no folder for the cache to save. GitHub scopes caches by branch and `ci.yml` runs only on pull requests and the merge queue, so nothing a PR saves reaches the next PR: `apt-cache-warm.yml` runs every distinct call on `main` every 30 minutes (one matrix row each, a hit costs seconds), so a new list or a new runner image has an entry on `main` within the half hour. Not every six hours, because the repository's caches sit at GitHub's 10 GB limit and GitHub evicts the least recently used past it: on 2026-11-12 the warmer's `cache usage` job measured 10.25 GB in 54 entries with the least recently used entry last touched 84 minutes earlier, so an entry restored less often than that is evicted. Per-PR `puppeteer-*` entries were the largest share (2.77 GB in 12 entries; followups.d 3145-p2). The Playwright container job's image already ships `git`; if a later image does not, an inline step (before checkout) installs it from its own cache, through the same mirror list and retries.
- **How to tell it from a real failure:** the log stops in the install step, before `npm ci`. With the cache warm, a mirror outage now shows only as a `::warning::` on a cache miss or a repair.
- **Kept fixed by:** `checkRawAptInWorkflows` in `tools/check-ownership.js` (via `build:check`) fails on an `apt-get`, `apt`, `aptitude`, `apt-fast` or `nala` install, update or download (options and `\`-continued lines included), `playwright install-deps`, or `playwright install --with-deps` in `.github/workflows/`, so a new step that reads the mirror in any of the usual ways fails the build (step names and `echo`/`printf` text are prose and pass; a folded `>` scalar or a command held in a variable is not caught, and review is the backstop); the one inline install that must (the container job's `git`, before checkout) is in `SANCTIONED_RAW_APT` with its exact line count. `checkAptCacheWarmer`, in the same file, reads every `apt-cached` and `playwright-browsers` call in the other workflows and fails when one has no row in `apt-cache-warm.yml` (match on runner, container, sorted list and, for Playwright, the folder that pins its version) or a row matches no call. Each `apt-cached` call also writes one line to its job's summary: the cache answered **hit** (this image's entry), **fallback** (the last image's entry, restored through the restore key) or **miss**, and what the mirror had to supply. The same `repair` line on run after run is an entry that no longer fits: delete the caches whose key starts with that line's folder name. `apt-cache-warm.yml` turns that into a red run: both actions expose the answer as step outputs (`key`, `cache`, `repaired`), and a warmer job whose entry restored as an exact **hit** and still repaired fails, naming the key to delete. One run is proof, because actions/cache never saves over an exact hit, so that entry repairs in every job that restores it until the runner image moves. A repair after a **fallback** or a **miss** passes: it is how a new image gets its entry, and the next warmer run shows a clean hit. To clear it, delete every entry whose key starts with the folder name (the `base` output), not just the one key: the restore key would fall back to the older entry that seeded the misfit, and the next save would repeat it. Three more ways the warmer could pass while wrong are checks too. A warmer job that did not hit saves its entry itself and then looks it up by its exact key (`lookup-only`, and its `cache-hit` output, which a longer key that only starts with this one does not set), waiting a minute and looking once more in case another job holds the key while it uploads; so a save that fails is red in the same run instead of a fallback and repair on the next one. The action's post step then archives the set again and is refused the taken key ("Failed to save: Unable to reserve cache"), which is expected. The container row fails unless its image ships `git`, because `studio-e2e-nightly.yml`'s firefox-webrtc job installs git first when it is missing, and that changes the dpkg package list a container key hashes. And `apt-cached.sh` waits out another process holding dpkg's lock (three tries, then it fails) instead of reading the lock as a set that does not fit. The warmer's `cache usage` job prints what every cache in the repository weighs against GitHub's default 10 GB (a repository can set its own, and the figure can lag the newest saves), and warns past 8 GB, because past the limit GitHub evicts the least recently used entries.
- **Triggered by:** a DNS or network failure between the runner and Ubuntu's mirrors.
- **Removable when:** the runner image carries the packages (then the cache step finds them installed and downloads nothing).

## `studio-smoke` red on "the pre-paint replay never ran"

- **Symptom:** `@smoke a reload paints one geometry per element` in `docs/e2e/playground-first-paint.spec.ts` fails
  on some runs with `the pre-paint replay never ran`, on PRs that touch nothing near the Playground (six runs from
  2026-10-27, among them 40431166278 and 40727236903), and passes 60 times in a row locally.
- **Cause:** the Playground's snapshot capture skipped any capture within 500 ms of the last one
  (`PlaygroundApp.tsx` `captureFirstSlide`). The test seeds a snapshot, drags the divider and reloads; when the app's
  first capture landed less than 500 ms before that reload (run 40727236903's trace: the poll that saw the snapshot
  took 45 ms instead of 3, because the page was busy capturing, and the reload followed 0.34 to 0.42 s later), the
  reload's `pagehide` capture was skipped. The stored snapshot kept the pre-drag pane width, and the replay in
  `playground.astro`, which paints only into the box a snapshot was measured in, returned without a word.
- **Fix:** the dedupe now skips only a capture of the SAME box (PR #2960). `@smoke a reload right after
  a capture still replays the slide at the new pane width` holds it still: it freezes `Date.now()` with
  `page.clock.setFixedTime`, so the reload always lands inside the old window. It fails 5 of 5 on the pre-fix build
  with the CI message and passes 10 of 10 with the fix.
- **Reading a smoke trace without the 2.5 GB artifact:** the artifact zip's central directory is at its end, so HTTP
  range reads fetch one test's `trace.zip` (4 MB here). `0-trace.trace` is JSON lines; the `before` / `after` pairs
  give each action's timing and every `page.evaluate` result.

## A macOS platform-suite check is red on a pull request, and the job has no steps

- **Symptom:** a `Platform suites (macOS / Windows)` run on a pull request or a dispatch is red. The macOS job in it
  (`export-confine`, `os-sandbox-measure`, `wait-for-macos`) reads `cancelled` after 15–21 minutes, with 0 steps and no
  runner name. Its annotation says "The job was not acquired by Runner of type hosted even after multiple attempts", and a
  notice names "capacity constraints … macOS arm64".
- **Cause:** GitHub had no macOS arm64 runner to give. No test ran, and the code under test is not involved. The run still
  concludes `failure`, so the pull request shows a red X. 19 of the 20 red non-iOS macOS jobs from 2026-10-21 to 11-04 were
  this; none was a regression. Sessions that dispatch more suites for the same commit (the evidence plan) compete for the
  same runners and make it likelier.
- **What to do:** confirm the job has no steps (`list_workflow_jobs`: `steps` empty, `runner_name` empty). If so, re-run
  that job once, and only once, after the queue drains. Do not dispatch another copy alongside it, and do not debug the
  suite. The platform suites are not a merge gate (`platform-suites.yml` header). On a scheduled or dispatch run you need do
  nothing: since 2026-11-04 the `alert` job files no issue for it, and `platform-suites-supervisor.yml` re-runs the job once.
  `npm run evidence` no longer lists a suite for dispatch when the PR run already starts it.
- **Record:** `engineering/decisions/2026-11-04-ci-flake-audit.md` §5 and §6 (D2, decided A).

## A spec on `serveDist` draws no diagram, even online

- **Symptom** — a spec that serves the built site with `docs/e2e/serve-dist.ts` (the PWA and offline specs) sees a
  Mermaid fence settle `error`, and the console says "Access to script at …/frames/mermaid/… from origin 'null' has
  been blocked by CORS policy".
- **Cause** — the sandboxed draw frame has origin `null` and imports Mermaid's module graph from `frames/`, which needs
  `Access-Control-Allow-Origin: *`. GitHub Pages sends it on everything, and `preview-e2e.mjs` and `serve-h2.mjs` match
  it; `serve-dist.ts` did not, so no test on it could draw a diagram.
- **Fix** — `serve-dist.ts` sends the header (2026-11-12). A new static server for tests sends it too.

## A spec with its own `http` server hangs at its test timeout after every step passed

- **Symptom** — the trace's last step passes, nothing more is recorded, and the test dies at its test timeout
  (`read-article-beacons.spec.ts`, 2 of 10 runs under load, at 300 s).
- **Cause** — `server.close()` in the `finally` waits for every open connection to end, and the browser keeps its
  keep-alive connections to the loopback server open.
- **Fix** — call `server.closeAllConnections()` before `close()`, as `studio-warm-offline.spec.ts` does.

## A Chromium-backed test file reads green in CI when the runner has no browser

- **Symptom:** A render-backed `node --test` file passes in CI, and nothing in the log says it never rendered a slide.
- **Cause:** The file resolved Chromium itself and, finding none, declared
  `test('SKIPPED — no Chromium available', { skip: true }, () => {})` and returned. `node --test` counts a skipped test
  as passing and reports nothing at the file level, so a runner that lost its browser turns the whole suite green. Twelve
  integration files did this until 2026-11-12.
- **Fix:** Resolve with `resolveChrome` and gate with `skipWithoutChrome` from `test/helpers/chrome.js`: it skips on a
  laptop with no browser and returns `false` under `CI`, so the test runs and fails loudly in any job that expects a
  browser. For any other tool or build output, `skipUnlessCI(missing, reason)` does the same. `checkFlakyTests` counts a
  literal `{ skip: true }` as a `disabled-test` and a machine-dependent skip that bypasses both helpers as an `env-skip`
  (HARD RULE #33); the second is baselined, so its count can only fall.

## An e2e that counts something in the preview frame, then measures it, fails with "Frame was detached" on WebKit

- **Symptom** — `locator.evaluateAll: Frame was detached` (or "Execution context was destroyed") right after a `toHaveCount` through `livePreview(page)` passed, usually after a `setViewportSize`; 1 run in 18 alone on `webkit-phone`, more under load (`plugin-placeholder-cells.spec.ts`, `library-images-render.spec.ts`).
- **Cause** — a resize mounts a fresh preview frame, hidden until it reveals, and the old one goes away. The count found the old frame and the measurement the gap between them; a `:visible` locator re-resolves the same way (`plugin-returns.spec.ts`: a strip remounted closed after the check).
- **Mitigation** — read and measure in ONE `page.evaluate` that finds the frame from the parent (`document.querySelector(LIVE_PREVIEW)`), returns null until that frame is revealed (`style.opacity === '1'`) and holds what the test needs, and poll it. Never split "is it there" and "how big is it" across two calls through a frame locator.
- **Triggered by** — any e2e that resizes, then measures inside the preview.
- **Removable when** — never.
- **Commits** — the flaky-e2e touch PR of 2026-11-12.

## A hang guard on a synchronous call never fires, and the test runner hangs instead of failing

- **Symptom:** a test guards against a hang with node:test's `{ timeout }`, a `Promise.race` against a timer, or a
  stopwatch assertion after the call. When the code under test does hang (a QuickJS loop the wall's limit no longer
  stops, a `readFileSync` on a FIFO with no writer), the test neither passes nor fails: the runner sits at 100% CPU or
  blocked, and CI fails only at its job limit with no test named.
- **Cause:** every one of those guards is a timer or an assertion that runs AFTER the call returns, and a synchronous
  call that never returns blocks the event loop, so no timer of that process can fire. node:test's own `timeout` is a
  timer too. Seen 2026-11-12 on `test/unit/plugins/katex-wall.test.js`: with the wall's interrupt handler removed
  before a result is read, a hostile getter spun for minutes under a 120 s test `timeout`.
- **How to tell:** the hanging call is synchronous (WebAssembly, `fs.*Sync`, a regex `exec`, a tight loop) and the
  process shows one core pinned or a blocked read.
- **Fix:** run the call that might hang in a child process (`spawnSync(process.execPath, ['-e', script], { timeout })`)
  and assert `signal === null`: the kernel kills the child at the deadline whatever its event loop is doing, so a hang
  becomes a clean failure. The deadline is a hang guard, sized far above the normal cost, and passing never depends on
  it (HARD RULE #32, F4). Assert on what the child reports (an error message, a count of reads, where a fake clock
  stopped), never on how long it ran. `katex-wall`'s LIMITS test and `npm-plugin-loader`'s FIFO test are the pattern.
- **Cost of not knowing this:** a guard that reads as protection and catches nothing; the rewrite's own failing arm is
  how this one was found.

## A gate test fails with ENOENT on a file nobody committed (`__or_probe__.astro`)

- **Symptom:** under load, or with two suites running at once, a test that walks a real folder (here
  `checkAudioPlaybackBoundary` over `docs/src`) throws `ENOENT: no such file or directory, open
  '…/docs/src/pages/__or_probe__.astro'`. Seen 2026-11-12 in the unit-tier load sweep, never on an idle run.
- **Cause:** another test wrote a probe file INTO the live checkout and deleted it in `finally`. A concurrent walk listed
  the probe, then read it after it was gone (HARD RULE #32, F7). The voice-sample tests did the same with a worse
  failure: they renamed the real, paid-for `docs/public/voice-samples` aside to a fixed `.test-backup` name, which two
  concurrent runs race on.
- **Fix:** a gate a test feeds fixtures to takes its root (`checkOpenRouterBudget(errors, root)`,
  `checkVoiceSampleAssets(errors, samplesDir)`), and the test passes a `mkdtemp` tree. Never write a probe under the repo.

## A test is red in the cloud sandbox and green on CI: two different Chromes

- **Symptom:** an integration test fails every time in the sandbox and passes on CI, with no flake.
- **Cause:** CI's integration job uses puppeteer's pinned Chrome (131.0.6778.204, from `~/.cache/puppeteer`).
  The sandbox exports `CHROME_PATH` and `PUPPETEER_EXECUTABLE_PATH` as `/usr/bin/google-chrome`, Chrome for
  Testing 153. Two builds round and serialize differently: 153 snaps outline widths and offsets to whole pixels
  (`calco-focus-column`), and writes keyword background positions as `calc()` (`contrast-probe-gradient`).
- **Fix:** a test asserts what the browser itself reports, read from the same page, never one build's rounding
  as a constant. To run a file on CI's build: `npx puppeteer browsers install chrome@131.0.6778.204`, then set
  both `CHROME_PATH` and `PUPPETEER_EXECUTABLE_PATH` to the path it prints (a test may read either).
- **Removable when:** the sandbox and CI pin the same Chrome.

## A job in the Playwright container fails before any test with `Node.js v22.20.0 is not supported by Astro!`

- **Symptom:** the Studio nightly's `firefox-webrtc` job (it runs in `mcr.microsoft.com/playwright:v1.56.1-noble`) ends in
  seconds with `Error: Process from config.webServer was not able to start. Exit code: 1`, and the line above it reads
  `Node.js v22.20.0 is not supported by Astro! Please upgrade Node.js to a supported version: ">=22.23.4"`. No test ran.
- **Cause:** a container job uses the image's own Node, which is the one Playwright built the image with, and it does not
  move when our dependencies do. Astro 7.4 raised its floor to 22.23.4; jobs on the host runner get the current 22.x from
  `actions/setup-node` and never saw it.
- **How to tell:** `docker run --rm -v "$PWD:/w" -w /w/docs mcr.microsoft.com/playwright:v1.56.1-noble ./node_modules/.bin/astro --version`
  prints the same refusal.
- **Fix:** an `actions/setup-node` step with `node-version-file: .nvmrc` before `npm ci` in the container job, which puts the repo's Node first
  on PATH. Any new container job needs the same step.
