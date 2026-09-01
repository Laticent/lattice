# Gotchas — CI and the cloud sandbox

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

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
- **Cause:** The headless-Chromium browser auto-detection (the owned
  engine's Puppeteer launch, and anything marp-cli-based) looks in the
  standard system locations
  (`/usr/bin/google-chrome`, etc.) and doesn't know about the
  puppeteer-cached chromium binary that the sandbox ships with. The
  binary IS present at
  `/root/.cache/puppeteer/chrome/linux-<version>/chrome-linux64/chrome`
  — auto-detection just can't find it on its own.
- **Mitigation:** Set `CHROME_PATH` in the env before rendering. The
  canonical render is the owned emulator:

  ```bash
  CHROME_PATH=$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome | head -1) \
    node dist/lattice-emulator.js <deck>.md <deck>.pdf
  ```

  The integration test helper at
  [test/helpers/render.js](../test/helpers/render.js) inherits
  `process.env`, so the same env var works for tests too. If you
  install marp-cli yourself (`npm install @marp-team/marp-cli`) to
  render an Export-to-Marp bundle — marp-cli is **no longer bundled**
  (P4 retired it as a render path; the owned engine renders every
  first-party path) — the identical `CHROME_PATH` discovery issue
  applies to that `npx marp` invocation.
- **Triggered by:** Any render (owned emulator, or an ad-hoc marp-cli
  invocation) in a fresh cloud-sandbox session.
- **Removable when:** The launcher adds puppeteer-cache discovery, or
  the sandbox ships chromium at one of the canonical system paths.
- **Commits:** documentation-only — captured here so future sessions
  don't conclude no browser is available.

## A generated `dist/` artifact goes "stale" after a rebase, and that is not a defect

- **Symptom:** You rebase on `origin/main` (HARD RULE #16 requires it right
  before every push), the pre-push hook runs the unit suite, and a test fails
  saying an artifact is stale — naming a subsystem you never touched. Meanwhile
  `npm run build:check` says every artifact is up to date, so two gates appear to
  contradict each other over the same file. `--no-verify` is banned (HARD RULE
  #14), so the push is genuinely stuck until you work out what happened.
- **Cause:** `dist/` has been gitignored since #1742, so everything in it is
  whatever your last local build wrote. The SessionStart hook builds once, at
  session start. Any source that arrives afterwards — a rebase, a `git pull`,
  your own edit — leaves the artifacts behind the sources, and a test that
  recomputes from current sources and compares to disk then differs for a reason
  that has nothing to do with your change.
- **The fix is a FULL `npm run build`. Not `npm run css:build`.** This is the
  part that costs a second round: `css:build` refreshes `dist/lattice.css` and
  `dist/lattice.min.css` and stops there, while `dist/marp-kit/` is built by a
  later step from `dist/lattice.min.css`. Run it alone and you trade one stale
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
  `lib/components/chart/journey/journey.styles.css` that `fbb6287` changed: a
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
  spuriously red locally after the rebase the repo requires.
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
  bump. Dependabot closes its own PR once `main` carries the version.
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
