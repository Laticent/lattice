# Development environment

How the project is built, tested, linted, and shipped — every tool, every
script, every hook in one place. For *workflow* (branching, feature decks,
PR process, the two-renderer rule, the share-the-PDF rule), see
`workflow.md`. This file is the *tooling* counterpart.

Source-of-truth lives in the config files (`biome.jsonc`, `lefthook.yml`,
`.c8rc.json`, `.nvmrc`, `jsconfig.json`, `.github/workflows/ci.yml`,
`tools/affected-tests.js`). This doc explains the *why* and the *when*.

## Quick reference

| What | Command |
| --- | --- |
| Inner-loop watch | `npm run test:watch` |
| Run one scope | `npm run test:<scope>` |
| Run one file | `node --test <file>` (the `<dir>` form errors — use a scope or `npm test`) |
| Lint | `npm run lint` (`lint:fix` to auto-fix) |
| Full check | `npm test && npm run test:integration` |
| Coverage | `npm run test:coverage` → `.scratch/coverage/index.html` |
| Force integration rebuild | `LATTICE_TEST_NO_CACHE=1 npm run test:integration` |
| Run the integration tier at push | `LATTICE_FULL_PUSH=1 git push` (else pre-push skips it; CI always runs it) |

Test scopes: `palette`, `mermaid`, `parsing`, `layouts`, `cli`. Integration
scopes: `galleries`, `parity`, `mermaid`, `screenshot`. Run via
`npm run test:<scope>` and `npm run test:integration:<scope>`.

## Node version policy

Three numbers, one purpose each:

- **`.nvmrc` = 22** — current active LTS, what `nvm use` puts devs on.
- **`engines.node` = `>=22.12.0`** — declared supported minimum. The `.12` is
  load-bearing; see the `require()`-of-ESM note below.
- **CI matrix = `[22, 24]`** — verifies the engines claim. The FULL unit suite
  runs on 22; on 24 a representative smoke subset (core/engine/parsing/contracts/
  transformers/export) confirms cross-version compat without paying 2× the whole
  suite. Widen the 24 subset if a Node-version-sensitive area grows.

Drop a version from the matrix iff you also bump `engines`. Bump `engines`
iff you drop a version from the matrix. The original cause of the
`node --test <dir>` outage that started this whole overhaul was
matrix=Node-18 while devs ran Node 22 — keep the three numbers aligned.

`engines` is **`>=22.12.0`**, not `>=22`, and the extra `.12` is load-bearing:
`lib/authoring/{lint,review,scorecard,fact-check}-core.js` `require()` the ESM
`lib/core/class-directive-scan.mjs` so the six authoring resolvers share one
reader, and `require()` of an ES module is unflagged only from 22.12.0
(`tools/export-marp.js` had been doing the same with `glossary-auto.mjs` under
the looser claim). The matrix pins `22`, which resolves to the newest 22.x, so CI
cannot catch a floor that is stated too low — the `engines` value is the only
place that claim is made. If a `require()` of an `.mjs` is ever removed
everywhere, the floor may drop back.

**Node 18 + 20 are deliberately unsupported.** Node 18 has been EOL since
April 2025; Node 20 entered maintenance in April 2026. `node:test` moved
fast across 18 → 22 (the glob syntax in `package.json` scripts requires
Node 21+; describe-level `concurrency: true` requires Node 20.10+).
Supporting them would mean freezing into a pre-Node-21 API forever. If
a consumer needs Node 18 or 20, they pin to Lattice 1.x.

## npm scripts

**The full, always-current catalog of every script, tool, and framework is
[`engineering/capabilities.md`](./capabilities.md)** — generated from
`package.json` + the `tools/` headers and gated by `capabilities:check`, so it
can't drift. `npm run` lists every script live. **Before building any tool or
harness, look there first** (we already have a benchmark, a parity harness,
scaffolders, …). This section calls out only the daily inner-loop:

| Script | Purpose |
| --- | --- |
| `test` | Full unit suite (the inner loop) |
| `test:watch` | Re-run the unit suite on file change |
| `test:<scope>` | Scoped unit subset (`palette`/`mermaid`/`parsing`/`components`/`cli`/`engine`/`layout`/…) |
| `test:integration` | The FULL integration tier (every suite) — what pre-push runs under `LATTICE_FULL_PUSH=1` |
| `test:integration:pr` | The PR-blocking slice CI gates on: cross-path wiring (`parity/`) + export pipeline (`export/`) + per-component semantic invariants (`invariants/`) |
| `test:integration:nightly` | The render-regression slice that runs nightly on `main` (`integration-nightly.yml`): gallery/component/exemplar page-counts + mermaid + screenshot |
| `bench` | tinybench render benchmark — the owned engine over time (`-- --export` adds the rasterize tier, `-- --json` dumps machine-readable) |
| `lint`, `lint:fix` | Biome check / Biome check --write (never `npx biome`) |
| `lint:coverage`, `lint:coverage:bless` | Gate / re-record what Biome actually checks — see *Lint (Biome)* below |
| `preview` | Fast visual-iteration loop (scope-detect, rebuild affected, pixel-diff) |
| `build`, `build:check` | Regenerate / freshness-gate every generated artifact |

Everything else — the `*:build` / `*:check` generators, `new:*` scaffolders,
gallery builds, release and docs-portal scripts — lives in `capabilities.md`.

## Test layout

```
test/unit/palette/      palette, palette-resolution, contrast
test/unit/mermaid/      mermaid-var-map
test/unit/parsing/      source-parse, match-section, splitter,
                        slot-label-lift, markdown-it-plugins
test/unit/components/   component-manifest, journey, roadmap,
                        word-cloud, quadrant, radar
test/unit/cli/          cli
test/integration/parity/      color-parity, deck-class/finish/logo-fm,   [PR]
                              speaker-notes, chart-family
test/integration/export/      export-formats, html-player, present-mode, [PR]
                              marp-kit-render (real marp-cli; kit + export
                              bundle; skips off-CI with no registry, FAILS
                              on CI)
test/integration/invariants/  component-invariants (semantic gate),     [PR]
                              slide-contrast (rendered-DOM WCAG AA over
                              three galleries; imports PROBE from
                              tools/check-slide-contrast.js)
test/integration/galleries/   emulator.gallery                      [nightly]
test/integration/components/  component- + bucket-galleries          [nightly]
test/integration/exemplars/   exemplar-render (45 decks)            [nightly]
test/integration/mermaid/     mermaid-smoke                         [nightly]
test/integration/screenshot/  screenshot, svg-scaling              [nightly]
test/benchmark/               engine-bench.mjs (npm run bench; not in npm test)
test/helpers/                 render.js, pdf.js, palette.js
test/fixtures/                small .md decks for integration
```

### Contrast: two tools, one probe

`tools/check-slide-contrast.js` scores the rendered DOM of a deck: fast, one scheme,
backdrops resolved by climbing the ancestor chain. It is the one the invariants gate
imports, and its `PROBE` is the single source of truth for which runs exist, what ink
they carry, and which AA threshold applies.

`tools/check-player-contrast.js` reuses that same `PROBE` and changes three things it
structurally cannot do: it drives the real `--player` EXPORT rather than a plain render,
it scores BOTH scheme states (as exported, and after clicking `#lp-mode`), and it samples
each run's backdrop from a SCREENSHOT taken with the glyphs made transparent — so a
gradient, an image, a translucent overlay or a z-ordered rail resolves correctly because
it is simply there. That split is what makes its report actionable: an "as exported"
failure is in the PDF too (a deck or theme defect), while an "after the toggle" failure
exists only in the player (a scheme defect).

```bash
node tools/check-player-contrast.js examples/a11y.md            # a deck, exported first
node tools/check-player-contrast.js --json out.json exported.html
npm run contrast:player                                         # the corpus, vs the baseline
npm run contrast:player:bless                                   # re-record the baseline
```

**Where each one runs, and why there.** The two static tools are ~0.3s for the whole repo
and read the SOURCE — `contrast-audit.js` a palette's own token matrix, `composed-contrast.js`
the surfaces a component composes, both through the engine's own token evaluator. Between them
they cover token and composition drift cheaply, and they should stay the first thing you reach
for. Their blind spot is everything the export PIPELINE does to correct CSS on the way out: a
`light-dark()` pair collapsed to one arm, a selector re-meant by the minifier and then removed
by the prune. In both cases (#1645, #1642) the source was right, a static reading of it would
have reported a PASS, and the shipped artifact was wrong.

That pipeline half is gated **per-PR**, cheaply, by the real-surface test in
`test/integration/export/html-player.test.js` — it drives ONE deck's player in Chromium, clicks
the toggle, and asserts a computed value lands where the deck's own dark render puts it. Drift
in a transform is a property of the transform, so one deck catches it.

The CORPUS sweep runs **nightly** (`integration-nightly.yml`), because that part genuinely
costs: ~24s per deck — 16s to export the player, 8s to audit it — so `examples/` is roughly
55 minutes. The PDF is not the cost and is no longer written; the browser render, the
dynamic-component bake and the CSS prune are, and the player needs all three. It compares
against `test/oracle/player-contrast.json` — blessed **on `main`**, because ratios move with
every theme and contrast change and a baseline blessed on a branch is stale before that branch
merges — and fails only on a finding that is **new** or has got **worse** — the corpus's known sub-AA runs are tracked in #1745, and a nightly that
re-lists them is one people learn to skim. Re-bless with `npm run contrast:player:bless` once
a fix lands. The muted-chrome tier (header/footer/pagination) is WCAG-exempt by palette
contract and is reported in its own bucket, never as a failure.

`[PR]` suites gate every `code` PR via `test:integration:pr`; `[nightly]` suites
run on `main` via `integration-nightly.yml` (`test:integration:nightly`). The
split keeps shared-kernel wiring, the export pipeline, and the computed-style
correctness gate blocking, and moves the slow fresh-render regression suites off
the PR critical path — their stale-committed-artifact half is already backstopped
at pre-commit, so a next-morning catch on `main` is cheap to revert. Rationale:
`engineering/decisions/2026-06-27-integration-nightly-split.md`.

**`marp-kit-render` is the one suite that reaches outside the repo.** It renders
BOTH Marp hand-off artifacts — `dist/marp-kit` and a freshly exported
Export-to-Marp bundle — through real marp-cli, fetched on demand with `npx` at
the version range `lib/core/marp-bundle.js` exports. marp-cli is deliberately not
a dependency (HARD RULE #1: Marp is an export target, not a render path), and it
runs with `npm_config_ignore_scripts=true` since it executes registry content on
the merge path, and `CHROME_NO_SANDBOX=1` because marp-cli turns the Chromium
sandbox off for root and inside a container but NOT for a plain non-root VM —
which is exactly what a GitHub runner is, so without it every render dies with
"No usable sandbox!". `--browser-args` is not a marp-cli option and never was.

**The skip is local-only.** With no registry access it retries three times, then
skips *off* CI with a printed reason — hard-failing a laptop with no network just
teaches people to ignore the suite — and **throws on CI**. A gate that self-skips
in CI is not a gate: `# skipped 14` in a several-hundred-line TAP stream is not a
signal anyone reads, and the job goes green covering nothing.

Because the version range resolves fresh, the suite prints the resolved marp-cli
version and repeats it in every failure message — without that a red gate cannot
be triaged as "marp-cli moved" versus "we broke it." Renders are kept in
`.scratch/marp-render/` (gitignored, reaped by `npm run clean:scratch`) and CI
uploads them as an artifact on failure, because the defects this guards are the
kind you see on page one of the PDF.

The CI visual-correctness gate is the **per-component semantic-invariant suite**
(`test/integration/invariants/component-invariants.test.js`): it renders each
component's example through `lib/engine` into a real headless-Chrome DOM and
asserts on *meaning* — required slots resolve, no overflow, heading contrast ≥
WCAG AA — which is deterministic and machine-independent. It runs in the
`integration` tier, so the required `ci` check covers it. (The old marp-vs-engine
`engine-parity` pixel gate was retired with marp in P4 — the owned engine is
canonical. `npm run regress` survives as a LOCAL golden spot-check.)

Each test file wraps its body in `describe('<file-basename>', () => {…})`
so TAP output groups by file. Source of truth: `package.json` scripts
plus the directory layout.

## Lint (Biome)

**Linter on. Formatter intentionally OFF.** The codebase has hand-tuned
compact style — palette arrays kept in columns, inline `{}[key]` lookup
tables — that the default formatter would explode. The lint rules catch
real bugs without restyling intentional code. (When Biome was first
adopted, the linter found 7 real correctness issues and 30+ style
issues; the formatter would have rewritten ~43 of 49 files.)

Run via `npm run lint` (read-only) or `npm run lint:fix` (`check --write`,
includes the unsafe auto-fixes). Source of truth: `biome.jsonc` — `.jsonc`
because every exclusion carries a written reason naming its class (#1223).

**The reasons are a convention; the coverage they claim is a gate.**
`npm run lint:coverage` (`tools/check-lint-coverage.js`, also a `build:check`
preflight) asks what Biome *actually* checks, in three arms: a committed baseline
of the tracked files it does not process (`test/lint-coverage/baseline.json`),
Biome's own scanned-vs-checked tallies, and a violation-carrying probe written
into every checked directory *and language*. The accidental routes out of lint
all fail it — a `.gitignore` line, a deleted *positive* include, an `overrides[]`
that silences a path or an extension without moving the file count, a
`biome-ignore-all` comment. The deliberate ones it does **not** catch are
enumerated under RESIDUALS in the tool's own header; don't claim more than that. Record a deliberate
exclusion with `npm run lint:coverage:bless`, which leaves the diff as the
record; then say which class it is in the PR. An earlier gate that read the
*spelling* of `!` entries was removed before merge — it missed nine measured
bypasses and false-positived on a correct edit. Rationale and residuals:
`engineering/decisions/2026-07-28-lint-coverage-effect-gate.md`.

## Hooks (lefthook)

`npm install` wires the hooks automatically via the `prepare` script.
Configuration in `lefthook.yml`.

**pre-commit** (parallel, ~0.5s for scoped edits, ~5s for cross-cutting):
- `lint` — Biome on staged JS/JSON only
- `affected-tests` — `tools/affected-tests.js` maps staged paths to
  scoped scripts; runs only what's affected. See *Affected tests* below.

**pre-push** (serial, fail-fast cheap-first):
- `lint` — full tree
- `lint-deck` — repo-wide strict author-facing footgun sweep
- `build-check` — the CI/stale-artifact gate (regen + byte-diff of `dist/`)
- `docs-typecheck` — `tsc --noEmit` over the docs workspace (~36-40s), skipped
  when a push touches no `docs/` files. It is here because a docs TYPE error is
  invisible to every other local gate — biome does not typecheck, and vitest
  strips types via esbuild without checking them — so it used to surface only as
  a red required check in CI's `docs-build`. **Known gap:** `docs/src` imports
  root `lib/` directly, so a root-lib change can break docs types without
  tripping this guard; CI's `docs` paths-filter (which also lists `lib/` and
  `themes/`) still covers that. Widening the guard to match would put ~36s on
  nearly every engine push.
- `unit-tests` — full unit suite
- `integration-tests` — full cross-renderer parity + PDF page-count tier.
  Skipped when a push touches no render-relevant files (the job mirrors CI's
  `code` paths-filter in `.github/workflows/ci.yml`; keep the two in sync).

**commit-msg** (~0.01s):
- `format` — `tools/check-commit-msg.sh` validates `area(scope): summary`.
  Pass-through for git's machine-generated messages
  (`Merge…`, `Revert…`, `fixup!`, `squash!`, `amend!`).

Bypass with `git commit --no-verify` only as a genuine last resort.

## Affected tests

`tools/affected-tests.js` is the brain of the pre-commit speedup. Given a
list of staged files, it picks the minimal set of npm scripts that cover
them.

```
lib/<X>.js              → SCRIPT_FOR_LIB[X]      (e.g. palette.js → test:palette)
test/unit/<scope>/*     → test:<scope>
themes/*.css            → test:palette
docs/, examples/, *.md  → skip — no tests needed
lattice-emulator.js,    → full unit suite        (safe fallback;
lattice-runtime.js,                                renderers touch everything)
lattice.css,
package.json, etc.
test/helpers/*          → full unit suite        (shared infra)
unknown lib/<X>.js      → full unit suite        (safe fallback)
```

When a staged file isn't recognized, the script falls back to the full
suite. Better to be slow than miss a regression. Pre-push runs the full
suite regardless as a second safety net.

## Coverage (c8)

Configured in `.c8rc.json`. Reports HTML to `.scratch/coverage/` (the
`.scratch/` tree is `.gitignored`) and a text-summary to the console.

**Coverage is NOT a CI gate** — it's a diagnostic for "what's untested
in the area I'm changing?" Baseline today: ~41% statements / ~80%
branches / ~77% functions. Statement number is low because
`lattice-emulator.js` and `lattice-runtime.js` are exercised by
integration tests, not unit tests.

## CI

`.github/workflows/ci.yml` is path-gated and browser-lean. A top-level
`concurrency` group cancels superseded runs on the same ref.

- **`changes`** — classifies the diff (`dorny/paths-filter`). `code` is
  true unless EVERY changed file is prose markdown; decks
  (`examples/**.md`, `baseline-decks/**.md`, `**.gallery.md`) count as
  code. **A docs-only change runs lint only** — `unit` and `integration`
  are skipped.
- **`lint`** — ALWAYS runs, single Node, browser-free
  (`PUPPETEER_SKIP_DOWNLOAD=1`). `npm run lint` + `npm run lint:deck:all`.
- **`unit`** — code changes only. Matrix Node 22/24, `fail-fast: false`,
  browser-free. `npm test`, plus `npm run build:check` once (on 22) — the
  render-free artifact-freshness gate (css, default bundle, runtime +
  emulator bundles, component docs, portal, dist README).
- **`integration`** — code changes only, `needs: unit`, single Node (22).
  The only tier that renders, so the only one that downloads Chromium —
  **cached** via `actions/cache` on `~/.cache/puppeteer` (keyed on the
  lockfile). Installs `poppler-utils` (for `pdfinfo`), runs
  `npm run test:integration`. ~2–3 min cold.
- **`ci`** — the single gate job (`if: always()`). **Set this as the only
  required status check** in branch protection: it passes when lint
  succeeds and the test tiers passed or were skipped, so the conditional
  jobs never leave a PR stuck on a pending required check.

Integration runs once because the emulator/Puppeteer pipeline
doesn't vary with Node version; matrix-testing the slow tier is paranoia,
not insurance. Only `integration` needs Chromium — `lint` and `unit` skip
the download (~150 MB) since neither renders.

**Every job carries a `timeout-minutes`.** GitHub's default is six hours and only
`studio-smoke` had a cap. `npm ci` on node 24 wedged twice on 2026-09-02 — 42m23s on
#2028's merge-queue run and 75m58s on a PR run — against 16 seconds on node 22; both
were cancelled, so six hours is the ceiling an uncancelled wedge would reach rather
than one this repo has paid. Caps: `changes` 5 · `lint` 10 · `unit` 15 ·
`integration` 25 · `golden-diff` 25 · `docs-build` 20 · `studio-smoke` 15 · `ci` 5.

**Read the ratios, not the round number.** Measured across the last 100 completed
`ci.yml` runs, cap-over-worst-observed spans **1.1x to 27x**, and the two ends are the
interesting ones. `studio-smoke` is the thinnest in the file: its worst run took 829s
and *passed*, 501s of which was the Playwright browser download — an unbounded external
fetch against a ~40s norm — so it sits 71 seconds inside its cap, not nine minutes.
`golden-diff` is input-dependent rather than slow-but-stable (p50 91s, p90 511s), since
it rasterizes only the goldens a PR moved; a corpus-wide re-bless has no ceiling that
sample can see. The full table lives in the `ci.yml` comment block. Being wrong high
costs one slow run before a wedge is cut off; being wrong low reds a PR that would have
passed. If a job outgrows its cap, raise the number and say what the new measured
duration is — don't delete the line.

## Integration test cache

`test/helpers/render.js` hashes all renderer inputs and reuses
`.scratch/test-cache/emu-<hash>.pdf` when the hash matches.
Cold cache: 30s. Warm: 0.17s (170× speedup for re-runs against unchanged
inputs).

**Hash inputs** (any change invalidates):
- source `.md` content
- `lattice-emulator.js`
- `lattice.css` + every `themes/*.css`
- every `lib/*.js`
- `mermaid-v11.min.js`
- `package-lock.json` (catches dependency upgrades)
- palette argument
- Node version

**Cache OFF when:**
- `CI=true` — CI must verify the real build, not the cache
- `LATTICE_TEST_NO_CACHE=1` — debug opt-out if cache seems stale

**Eviction:** `npm run clean:scratch` (14-day GC). Returned PDF paths
are owned by the cache; callers MUST NOT `unlinkSync` them.

## Waiting for a slow job

**Never hand-roll a wait.** Every wait goes through `tools/wait-for.sh`, and
**one job gets one waiter**.

The shape to never write again is the obvious one:

```bash
# WRONG — unbounded, anonymous, and it outlives everything.
until grep -q "done" build.log; do sleep 5; done   # in a background Bash call
```

It has no deadline and no identity, and both gaps have been paid for. One
session left **fifteen** of these resident — six of them waiting on the same
integration run, still polling after five hours. They multiply because a
condition that never matches produces no notification, so the next turn assumes
the wait was never started and spawns another with slightly different wording.

Idling costs nothing measurable (about 16 seconds of CPU over five hours). The
expense is the **late fire**: a waiter that finally matches hours later wakes the
session with an expired prompt cache, so the whole conversation re-enters at full
input price rather than the roughly 10% cache-read price — once per duplicate.
That is why the helper's deadline is capped under the cache TTL.

Two modes. Prefer the first:

```bash
# Run the job AND wait, as ONE background task. Its exit is the notification,
# so there is no second shell polling for it.
tools/wait-for.sh --job integration -- npm run test:integration

# Only when the job is already running elsewhere: poll a predicate, bounded.
tools/wait-for.sh --job docs-server --timeout 120 --until 'grep -q ready /tmp/astro.log'
```

Run it through the harness's `run_in_background` when you want to keep working;
the helper is what guarantees it ends. What it gives you:

- **A deadline on every wait.** Default 1800s, ceiling 3600s. Overrunning and
  taking the TERM exits 124; a job that ignores it and gets SIGKILLed exits 137,
  reported separately because a 137 is just as often an OOM as a timeout.
- **One waiter per job.** A second wait on a live job exits 2 and names the
  holder rather than adding a duplicate. `--force` replaces it and **stops the
  waiter it replaces** — otherwise both run to their own deadlines and both fire.
- **A signal stops it.** TERM or INT ends the wait promptly, kills the job, and
  releases the lock (exit 143 on TERM, 130 on INT). A wait you cannot cancel is
  the same defect as a wait that never ends.
- **One line of output, at the end.** In run mode the command's own output goes
  to `.scratch/waits/<job>.log`, and the tail is echoed on any failure.

The lock is **`flock`** — the kernel's, not ours. This is the fourth version of
it and the first correct one: `mkdir`, then an atomic hard link, then a reclaim
path guarded by pid liveness and age. Review defeated all three, six different
ways, always the same failure — two live waiters on one job. Each needed
compare-and-swap semantics that a create plus a separate remove cannot provide,
and every fix opened a new hole.

`flock -n` is atomic, and the kernel releases the lock when the holder dies —
SIGKILL, OOM, a reaped container, anything. So the whole class stops existing
rather than being handled: no stale-lock detection, no zombie check, no
pid-reuse hazard, no age backstop, no reclaim race, and no unlink on release, so
a lock cannot be deleted out from under whoever replaced it. The file's contents
are now purely informational — who to name in a refusal, who to signal on
`--force`. Every correctness decision belongs to the kernel.

Two practical notes. The lock lives under `.git/lattice-waits/`, **not**
`.scratch/` — that directory is documented as throwaway, and a `rm -rf .scratch`
or `git clean -fdx` during a live wait would let a second waiter create a fresh
inode and take the lock while the first still runs. Logs stay in `.scratch`,
where disposable things belong.

**On a box without `flock(1)`, it falls back to perl.** `flock(1)` is util-linux
and macOS does not ship it — but macOS *does* have the `flock(2)` syscall, and
perl's `flock` builtin is a thin wrapper over it, with perl present by default
there. So the fallback is the same kernel primitive reached another way, not a
weaker imitation: it refuses while held and is released by the kernel on
SIGKILL, both measured. The subtlety is that perl locks the open file
*description* bash holds on fd 9 (`>&=` duplicates the description, not just the
number), so the lock outlives the perl process and lasts as long as the waiter.
`WAIT_FOR_LOCK_IMPL` pins the choice, and the suite drives **both** paths — a
second code path nothing exercises is how this tool kept breaking.

**The deadline needs GNU `timeout(1)`, and macOS ships none** — so the perl lock
fallback alone does not make this run there. `gtimeout` (from `brew install
coreutils`) is used when the GNU one is absent, and if neither exists the wait
fails with exit 69 naming the dependency. Unguarded this lied twice: run mode
reported `failed with exit 127`, blaming your command for the tool's missing
dependency, and poll mode burned the whole deadline before blaming your
predicate.

**macOS itself remains UNVERIFIED** (HARD RULE #23): what is tested is the
mechanism the macOS path would use, on Linux. Nothing in reach can close that —
every runner in `.github/workflows/` is `ubuntu-latest`, and a Linux transcript
is not evidence about a Mac. It takes someone running the four checks on a real
Mac: `--job x -- true` exits 0; a second waiter on a live job exits 2; a
SIGKILLed holder frees the job; and without coreutils it exits 69 naming
gtimeout. If neither mechanism is present, the wait fails loudly with exit 69
rather than being folded into "already being waited on" — which is what a naive
non-zero check did, reporting a phantom holder forever.

One sharp edge worth knowing, since it cost a measured bug: **a flock lives on
an open file descriptor, and children inherit descriptors.** The job this tool
runs must therefore be started with `9>&-` to close the lock fd, or it keeps the
lock held after the waiter itself is killed — reintroducing precisely the stale
lock flock was adopted to delete.

**A hook nudges you if you forget.** `.claude/hooks/warn-unbounded-wait.sh` runs
on every Bash call, spots the loop shape above, and prints a one-line pointer at
this section. It **warns and never blocks** — the same call this repo made for
`check-commit-msg.sh` (a message may legitimately quote British text, and HARD
RULE #14 bars `--no-verify` as the escape) and for #29's deck policy, stated
outright as "we warn, we coach." A blocking matcher tuned on one example is a
permanent tax on every future session; a false positive here costs one ignorable
line.

It reads the raw payload rather than parsing out the command field, because it
runs on **every** Bash call and the numbers decide it: 1.8ms for the match
against 36ms to start node for an accurate parse. Twenty times the cost on every
call is not worth the precision, for a warning. Note what this means: a repo
gate could never have done this job at all — `check-ownership.js` walks the
filesystem, and these waits are tool calls that never become files.

**It also says nothing where the helper cannot run.** The nudge names one fix,
and `tools/wait-for.sh` refuses with exit 69 unless the box has both a
`timeout(1)` and `flock(1)`-or-perl — so on a stock macOS, which ships neither
`timeout` nor `flock(1)`, the coaching would point at a wall. The check is the
last thing the hook does and only on a match, so the fast path above is
unchanged. Both dependency classes are tested one at a time, against the real
hook with a controlled `PATH`, alongside a positive control that fires with
`gtimeout` + perl present — a Mac that has run `brew install coreutils`.

**A waiter waits.** Do not attach an action to a condition — a background shell
that runs `build:check` when some file appears will happily run it three hours
later against a tree that has moved on. Run the job, or wait for it; not both.


## Editor setup

`jsconfig.json` gives VS Code / JetBrains / Neovim project-wide
IntelliSense and JSDoc resolution. `checkJs` is intentionally OFF —
enabling it surfaces ~33 DOM-narrowing errors in `lattice-runtime.js`
that would require `/** @type {HTMLElement} */` casts throughout; the
cast noise costs more readability than the type signal returns.

Recommended VS Code extensions:
- `biomejs.biome` — inline lint feedback from `biome.jsonc`
- `marp-team.marp-vscode` — preview `.md` decks

## Previewing the docs site (Astro) + screenshots

The docs site under `docs/` (Astro + Starlight) hosts the landing page, the
**Studio**, the **Playground**, and the component pages. **You can build, run, AND screenshot it in the cloud sandbox** — this
is the visual-verification path for any web-UI change (the counterpart to
`tools/rasterize-for-review.sh` for PDFs). Don't claim a web-UI change is
unverifiable here; run the site and look.

> Reviewing something *large* — every gallery, a whole-bucket audit, a
> responsive pass over many routes? Don't do it serially. Fan out parallel
> reviewer agents (one per deck/bucket/breakpoint), each running the tools
> below on its slice. See `engineering/visual-review.md`.

### The loop

```bash
# 1. ONE-TIME per sandbox: docs/ is a SEPARATE npm package, NOT a root
#    workspace, so the root `npm install` does not cover it.
cd docs && npm install

# 2. Serve with `npm run dev` — it runs the two sync steps (portal +
#    playground) THEN `astro dev`, and npm puts node_modules/.bin on PATH so
#    `astro` resolves. (Running `astro` BARE in a plain shell still fails — it
#    is not global; and the manual bin path SKIPS the sync steps, so the
#    preview can serve a stale bundle after a lib/ rebuild.) The site serves
#    at the ROOT base — pages live at http://127.0.0.1:4321/… (the old
#    /lattice project-page base is retired; see astro.config.mjs).
cd docs && npm run dev > /tmp/astro.log 2>&1 &
#   wait until /tmp/astro.log prints "ready". In the cloud sandbox a plain `&`
#   server can get reaped — prefer the harness's run_in_background to keep it up.

# 3. Screenshot any route, then VIEW the PNG with the Read tool (renders
#    inline) or SendUserFile.
cd ..   # back to repo root (puppeteer lives in the ROOT node_modules)
node tools/screenshot.js http://127.0.0.1:4321/studio/ \
  .scratch/shots/studio.png --width 1440 --height 900
```

`tools/screenshot.js` drives the puppeteer-cached Chromium
(`--no-sandbox`; resolves the binary from `CHROME_PATH` or the puppeteer
cache). Flags: `--width`/`--height`, `--full` (full-page), `--wait <css>`
(wait for a selector — useful for the Studio's hydrated panels),
`--delay <ms>`. Write PNGs under `.scratch/` (gitignored, 14-day GC).

### Routes

| Route | URL |
| --- | --- |
| Landing | `http://127.0.0.1:4321/` |
| Studio | `…/studio/` |
| Playground | `…/playground/` |
| Components index | `…/components/` |

The whole site chrome is ONE shared component — `docs/src/components/site/SiteHeader.astro`
(brand · nav · Tools disclosure · ⌘K command palette · theme controls), rendered by
every standalone route AND the Starlight docs zone (`Header.astro`). Nav links are the
single source of truth in `docs/src/lib/nav.mjs` (`contentNav` = inline; `toolsNav` =
the Tools group) — add a new top-level entry there. The interactive bits live in the
`NavActions.tsx` island (search/command palette via `CommandMenu.tsx`, the mobile Sheet).
The universal search is the ⌘K command palette: it navigates anywhere, switches theme,
and full-text-searches the docs via Starlight's Pagefind index (built site only — in
`npm run dev` the palette still navigates/themes, just without doc-text results).

### React StrictMode on the island roots

The Studio and Playground island roots hydrate through thin wrapper components —
`StudioIsland.tsx` / `PlaygroundIsland.tsx` — that mount the real shell inside
`<StrictMode>`. StrictMode must be an *ancestor* of the component whose effects
you want double-invoked, so wrapping at the island entry (not inside the shell's
own `return`) is what makes the shell's own top-level effects double-mount in dev.
That double-mount is the only automatic net for a missing-cleanup leak — an effect
that adds a listener / timer / subscription with no cleanup return — which no lint
rule catches (Biome's `useExhaustiveDependencies` checks the deps array, not the
cleanup). It's dev-only (StrictMode compiles to a pass-through in production
builds), so it ships on the island for free. When you add a new imperative island,
wrap it the same way and re-run the console probe — watch for errors thrown during
the mount → unmount → remount cycle, the tell for a cleanup gap.

### Screenshot matrix for the pane split (Playground + Studio)

The editor|preview split (`docs/src/components/ui/split.tsx`, decision
`2026-07-02-resizable-editor-preview-panes.md`) adds *stateful* layouts, so a
visual pass over either surface covers: default split, editor collapsed,
preview collapsed (in Studio: including the collapsed preview rail sitting
beside the closed Inspector rail — the dual-rail adjacency is a named review
state), at 1440/820/390, light + dark. **Pin or clear the storage keys**
(`lattice-docs-split-playground` / `lattice-docs-split-studio`, plus their
`-collapsed` sessionStorage twins) before every shot — a stray persisted ratio
shifts every pixel.

### Traps (full entries in `gotchas.md`)

- **`docs/` is a separate package** → its own `npm install`; the root
  install / SessionStart hook does not cover it.
- **Running `astro` BARE → `sh: astro: not found`** (it isn't global) → use
  `npm run dev` (npm adds `node_modules/.bin` to PATH and runs the sync steps
  first); the bare-binary path skips the sync and can serve a stale bundle.
- **`pkill -f astro` self-kills** the shell whose command line contains
  "astro" → stop the server by PID or by port (`fuser -k 4321/tcp`) instead.
- **A service worker from a prior `astro preview` can shadow `astro dev`**
  (same origin) → dev builds self-unregister on load; one reload clears it.

### The docs site is an installable PWA (offline cache)

The site ships a web-app manifest (`docs/public/site.webmanifest`, icons
generated by `tools/make-pwa-icons.js`) and a **runtime-caching service
worker** (`docs/public/sw.js`): visited pages work offline (network-first
HTML, stale-while-revalidate assets, PDFs/PPTX/zips never cached), unvisited
navigations fall back to `/offline/` (`docs/public/offline/index.html`). The head tags +
registration live in ONE component — `docs/src/components/site/PwaHead.astro` —
included by `<ResourceHints>` (standalone routes) and the `ThemeProvider`
override (Starlight docs zone). The worker registers on **production builds
only** and self-unregisters in dev; Playwright blocks it globally except
`e2e/pwa.spec.ts`. Rationale + strategy table:
`engineering/decisions/2026-07-02-docs-pwa.md`; the dev-shadowing trap:
`gotchas.md` § Docs site.

**The installed app is the Studio**: the manifest launches `/studio/` under
the name "Lattice Studio" (scope stays site-wide so docs open inside the app
window), tapping the icon focuses a running Studio rather than opening a
second copy, and the icon carries New deck / Docs shortcuts.
Install is offered in-app (Workspace → General → Install the app;
`install-app.ts` + the `beforeinstallprompt` capture in `PwaHead.astro`).
Identity rationale: `engineering/decisions/2026-07-03-pwa-studio-identity.md`.

### Docs-site quality gates (responsive + web-perf)

The docs gates split by **gate species**: a deterministic check (layout width,
a property of the code) stays per-PR; the runner-coupled web-perf budget moved
to a nightly relative-regression watch (see
`engineering/decisions/2026-06-15-docs-perf-gating-policy.md`). All runnable
locally from `docs/`:

- **`npm run check:overflow`** (`docs/scripts/check-overflow.mjs`) — per-PR
  (runs in `ci.yml` `docs-build`, advisory via `continue-on-error`). A horizontal-overflow
  guard: loads every converted surface at **390 / 700 / 820 / 1440**
  (mobile / tablet-floor / tablet / desktop), exercises the interaction states (drawer/pane
  switches, overlay opens), and fails if any page is wider than its viewport (a
  pannable page breaks on touch). Needs a built `dist/` + `CHROME_PATH`.
  It measures **three different things**, and a case opts into the last two by name —
  reach for the right one, because they do not substitute for each other:

  | Measurement | Case key | Catches |
  | --- | --- | --- |
  | page `scrollWidth > clientWidth` | (always) | the page pans on touch |
  | element `scrollWidth > clientWidth` | `noSelfOverflow` | a row that fits the page but not itself, so the controls at its end are off-screen (#1381) |
  | child rects vs. the parent's **padding box** | `noChildSpill` | a box shrunk past its own non-shrinking children, which now paint outside it (#1417) |

  The third exists because the first two are blind to it. A flex item with `min-width: 0`
  may shrink below the intrinsic width of its `shrink-0` children; nothing about that grows
  any ancestor's `scrollWidth`, and `scrollWidth` on the offender itself under-reports too
  (an `overflow: visible` box omits its end padding, so 11px of real spill read as 1px).
  Any element engineered to *absorb* a row's pressure — the Studio deck pill is the
  canonical one — needs `noChildSpill`, precisely because keeping `scrollWidth` quiet is its
  job. A selector matching nothing is reported as a MISS under every one of the three, never
  as silence.
- **`npm run perf`** (= `perf:collect` to `.perf/local` + a report) — measures
  the current site, median-of-3, desktop (`lighthouserc.cjs`) + mobile
  (`lighthouserc.mobile.cjs`), and prints the numbers. **Report-only locally**
  (no base to diff against). The actual gate is the nightly:
  `.github/workflows/perf-nightly.yml` builds + measures `main@HEAD` vs the
  ~24h-ago commit back-to-back on one runner and diffs the medians
  (`scripts/perf-regression.mjs`) — a **relative** budget, not absolute
  thresholds (which rotted + flapped — issue #327). On a regression it opens a
  `[perf-nightly]` tracking issue. Tolerances live in `perf-regression.mjs`.

These live in `docs/package.json` (a separate package), so they are **not** in
the root capability index that `tools/build-capabilities.js` generates.

### Studio e2e suite (Playwright) — and running it in the sandbox

The Studio's real-browser e2e suite (`docs/e2e/*.spec.ts`, driven by
`docs/playwright.config.ts`) is **nightly, off the per-PR gate**
(`studio-e2e-nightly.yml`) — deliberately, per
`engineering/decisions/2026-06-28-experience-gating-playwright.md`. That
asymmetry is a footgun: a change to shared Studio chrome can pass every
PR-gating tier (unit/build/lint) while silently breaking specs that only the
nightly runs (the #780 drift; `2026-07-06-e2e-chrome-selector-contract.md`). So
**run the real specs when you touch Studio chrome** — the sandbox can, contrary
to the old assumption:

```
cd docs
npm ci                       # docs is a SEPARATE package; root install misses it
npm run build:e2e            # astro build (+ portal/playground sync) → dist/
npm run preview:e2e &        # astro preview on :4321 (playwright reuses it locally)
npm run test:e2e             # full suite, all three projects
npm run test:e2e:smoke       # the @smoke chrome subset only (desktop, ~20s)
npm run test:e2e -- e2e/inspector.spec.ts --project=desktop   # one spec
npx playwright test --project=desktop --grep @perf             # preview render-path perf
```

**`@perf` — the preview render-path measurement** (`e2e/studio-preview-perf.spec.ts`). Reports
raw per-render RENDER / FRAME / TOTAL for the two interactions that drive a preview render —
slide NAVIGATION and TYPING — at 4× CPU, over both a prose deck and 40 gallery slides, because
the cost axis is **content, not slide count**. It prints numbers rather than asserting
thresholds (a wall-clock assertion would be a flaky gate), and it is in **no project's grep**, so
it never runs on the PR path — invoke it deliberately with the command above. Use it for any
claim about preview cost: `scripts/frame-bench.mjs` drives an edit by focusing `.cm-content` and
typing, which does **nothing** in the shipped default posture where the editor is off-screen, so
it silently reports no warm samples at all. This spec reuses `studio-fixture`, which already
handles that (`gotoStudio` seeds `posture: 'craft'`; `getByLabel('Deck source')` fails loudly on a
hidden element; `setEditorContent` uses `insertText` so a multi-line deck's `---` separators
survive the editor's markdown auto-continuation). It also asserts that typing produced renders,
because a caret outside the shown slide records **zero** samples on a preview that renders only
the shown slide — which reads as "free" rather than as a broken harness.

**`@a11y` — the WCAG rule set over the website** (`e2e/axe-site.spec.ts`). axe-core over 12
routes at **all three widths** in **both color modes**, plus the site menu open. Routed to
`desktop`/`tablet`/`mobile`, so it DOES run on the nightly path — and the two extra axes are
load-bearing rather than thorough-for-its-own-sake: every `scrollable-region-focusable` finding
on this site exists only at 390px, and three defects lived behind a closed menu. It reuses the
repo's own `axe-core` (no `@axe-core/playwright`) and promotes axe's `equalRatio` *incomplete*
to a failure, because an exact 1:1 — ink identical to its ground, i.e. an invisible label — is
filed as `incomplete`, not as a violation. Budget zero, two adjudicated exceptions, and a
self-check that plants defects and requires them to be caught. Run one width with
`npx playwright test axe-site --project=mobile`. Rationale and the still-open list:
`engineering/decisions/2026-08-19-website-accessibility-gate.md`.

**Note the distinct-tool boundary.** `tools/check-shadcn-bridge-contrast.js` grades the token
MATH of the shadcn bridge and `tools/contrast-audit.js` grades the theme token pairs; neither can
see which CSS rule wins. The 1:1 nav label that motivated the `@a11y` gate passed both. Token
gates and a rendered-DOM scan are complements, not alternatives.

The pinned Chromium is **pre-installed** at `PLAYWRIGHT_BROWSERS_PATH=
/opt/pw-browsers` (build 1194 ↔ `@playwright/test` 1.56.1) — do **NOT** run
`playwright install` *for Chromium*. `CHROME_PATH` is the *Puppeteer* cache and
is irrelevant to Playwright.

**The `@visual` snapshot bless DOES run here** (corrected 2026-09-01). This
section used to say it "genuinely can't run here (runner-specific AA)" and
stayed "nightly/UNVERIFIED locally per HARD RULE #23". The stated *cause* was
right; the conclusion did not follow. #1426 measured it: CI's own rendered PNGs,
range-fetched out of the nightly's 3.6 GB artifact and diffed against the
sandbox's renders of the same commit, differ by 2,627 px (desktop), 1,078
(tablet) and 765 (mobile) — ratios 0.0011–0.0023, **4–9x inside** the
`maxDiffPixelRatio: 0.01` the config already carries, and confined to a single
text run's subpixel fringing rather than spread across the image.

So the sandbox and CI do **not** render identically, and a baseline blessed here
still passes there. The margin is what makes a sandbox bless valid, not
identity — and the margin scales with how much small text the shot contains, so
a Studio change that puts much more small type on screen eats into it. Watch it
rather than assuming it.

**What that margin is for the CURRENT baselines is still unmeasured, and the
reason is worth knowing** (2026-09-02). #1426's 0.0011-0.0023 were measured on the
images #2028 replaced, so they do not carry over. Two halves, one of them now a
number:

- **Sandbox vs. the committed baseline: exactly zero.** Re-rendered here and
  compared at `maxDiffPixels: 0` **and `threshold: 0`** — no per-pixel tolerance at
  all — all three viewports are pixel-identical. So these baselines are sandbox
  renders, and the whole `maxDiffPixelRatio: 0.01` is available to absorb the
  sandbox-to-CI divergence rather than partly spent before CI sees them.
- **CI vs. the committed baseline: not obtainable from a green run.** A PASSING
  `toHaveScreenshot` writes no actual, expected or diff PNG, and the nightly
  uploads only `playwright-report/**` + `test-results/**` — whose traces carry
  lossy JPEG screencast frames, not the lossless comparison image. #1426's
  range-fetch worked because there were actuals to fetch; on green baselines there
  are none. Getting the number needs a run deliberately instrumented to FAIL
  (tolerance pinned to 0, so the comparator reports the true pixel count), and every
  route to one costs something outside the change. **`studio-e2e-nightly.yml`** is the
  only CI workflow that runs these specs, and its issue step has no event guard, so a
  `workflow_dispatch` posts to the rolling issue #1705 like a scheduled failure would.
  **`ci.yml` cannot be used as-is**: its one Playwright step is `test:e2e:smoke`
  (`--project=desktop --grep @smoke`), and `@visual` is neither `@smoke` nor
  desktop-only — so reaching it there takes a job edit, not just a push, and the
  instrumented run reds a live PR either way. Neither is a thing to fire off in
  passing — ask first.

**The shot's subject is a fixture, not the seeded deck** (2026-09-02). It used
to be `DECKS[0]`, whose editor pane fills a third of the frame — so the welcome
deck's copy was baked into all three PNGs, and one line of that copy is the live
catalog count (`61 components / 14 themes`), held current by
`test/unit/playground/welcome-deck-counts.test.js`. Adding a component therefore
turned three baselines red in a PR that never touched the Studio, and the only
available answer was a re-bless — the one thing this section tells you not to do
casually. `docs/e2e/visual-fixture.ts` now supplies a seven-slide deck carrying
no number the repo tracks. **Editing that file means re-blessing**, which is the
point: the re-bless is now a deliberate act, not a side effect. The spec asserts
the fixture's slide count against the slide rail before shooting — seed the deck
without JSON-encoding the source and the store silently boots the one-slide
blank starter, which is a starter deck photographed as a baseline.

**The PDF-export journeys DO run here** (corrected 2026-08-10). This section used
to say they need a Google-Fonts CDN the sandbox blocks; `journeys/author-export`
and `journeys/chart-export` were driven green repeatedly against the real Share
sheet during #1552, download artifact and all. Don't skip them on the old advice.

**A DEPLOYED page IS reachable from here — through a loopback reverse proxy.** The
sandbox gives *Node* an agent proxy (`HTTPS_PROXY`) and Chromium does not inherit it,
so `page.goto('https://…')` on any external host fails while `fetch()` in the same
repo succeeds. The failure mode varies by session — measured as `ERR_CONNECTION_RESET`
here, and as an `SSL_CONNECT net_error -101` on the tunnelled handshake (with no
certificate error anywhere in the net log, while `openssl` through the identical proxy
completed TLS 1.3 with `Verification: OK`) during #1776. The conclusion is the same
either way, and it is NOT "the deployed preview cannot be checked": put Node in the
middle. It fetches, Chromium only ever speaks to `127.0.0.1`, and what renders is the
real deployed bytes rather than a local rebuild of them — which is the whole point,
since a local build is exactly the thing a deployed-preview check is not allowed to
substitute (HARD RULE #23).

```js
// Run from docs/ (playwright lives there). Verified against a real deployed page.
import http from 'node:http';
import { chromium } from 'playwright';
const origin = new URL(process.argv[2]).origin;
const server = http.createServer(async (req, res) => {
  const up = await fetch(new URL(req.url, origin), { redirect: 'follow' });
  res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/octet-stream' });
  res.end(Buffer.from(await up.arrayBuffer()));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
```

Same-origin subresources ride along (the handler rewrites nothing — it forwards the
path). CROSS-origin ones do not, so a page that pulls a font or script from another
host renders without it; widen the handler to proxy those origins too before reading
anything into a missing asset. PR #1776's body claims the deployed Cloudflare preview
was UNVERIFIED because "Chromium cannot reach any external host through the agent
proxy" — that is false and this is what it should have said; the correction is on that
PR as comment 5387941880.

**WebKit is not in the base image — check before you conclude a spec is broken.** Only
Chromium is baked in (`/opt/pw-browsers/chromium-1194`). The `@webkit-phone` /
`@webkit-tablet` projects (`back-gesture`, the tablet-divergence specs) need WebKit
installed first, which is a *separate* action from the Chromium warning above and does
not touch the Chromium pin:

```
ls -d /opt/pw-browsers/webkit-*      # already there? a previous session may have installed it
npx playwright install webkit        # if not — lands in PLAYWRIGHT_BROWSERS_PATH
npx playwright install-deps webkit   # as root; the binary will not launch without these
```

Once installed it persists for the life of the sandbox, so a later check will find it
present — don't take that as evidence the base image ships it. Without it,
`--project=webkit-phone` fails to launch, which reads as a broken spec rather than a
missing browser.

**Fixed sleeps are gated.** Every `page.waitForTimeout(...)` call under `docs/e2e/**` —
whatever its argument — must carry an entry in `SANCTIONED_E2E_SLEEPS`
(`tools/check-ownership.js`, via `build:check`) saying why it is not a poll. A fixed wait on a nightly suite is a bet
that a loaded box finishes inside a guessed interval, and losing it looks exactly like
a real failure (#1526). The gate fails three ways: an **unlisted** sleep, a **stale**
entry whose sleep is gone, and a **drifted count**.

That third one is the reason it exists rather than a grep. The census **parses** the
suite (TypeScript compiler API) instead of matching text, because two hand-rolled
attempts got it wrong in ways that mattered: a `\d+`-only regex never saw
`waitForTimeout(SETTLE_STEP_MS)` in `studio-header-fit`, and a hand-written
comment/string blanker read the three backticks inside the regex literal
``/^\s*(```|~~~)/`` in `studio-preview-perf` as a template literal and swallowed four
real sleeps with the build green.

Counts are of *waits*, not of `waitForTimeout(` matches: a sleep that is the **entire
body** of a named function counts once per reference to that name. `back-gesture`'s
`settle` is one declaration called 23 times, so a text census recorded that file as
"14" (the figure #1526 carries, from before #1564 folded its raw sleeps into the helper —
not re-derivable from the current tree) while it held 24 fixed waits — adding a 24th `settle(page)` call now fails the
build. A function that merely *contains* a sleep among other work is not a helper and
counts once.

Before adding one, do what #1526 asks: **name the signal it waits for.** If there is
one, poll it bounded. If there is not — because the expected outcome is "nothing
changes" — keep the sleep, and note that a `MutationObserver` (record, dwell, then
assert the trace stayed empty) is usually stronger than sampling once at the end.
Entries seeded as `UNJUDGED` are inherited, not blessed: they record only that the
sleep exists.

**`page.mouse.*` is a real pointer drag — but never a *touch* drag.** Playwright's
`page.mouse.down/move/up` makes Chromium synthesize the full `pointerdown`/`pointermove`/
`pointerup` sequence, so a mouse-driven spec **genuinely** exercises an `onPointerDown`
handler + its `document` pointer listeners (a drag/reposition test is real, not theater —
`docs/e2e/diagnostics-overlay.spec.ts`). BUT the `mobile` project in `playwright.config.ts`
sets only `viewport` — **no `hasTouch`/`isMobile`** — so `page.mouse` there is *still* a
pointer drag; re-tagging a drag spec `@mobile`/`@crosswidth` buys **zero** touch coverage,
and near a clamp edge it just adds flake. If you actually need touch, opt in per-spec with
`test.use({ hasTouch: true })` + `page.touchscreen` / `locator.tap()` — and even then, real
iOS Safari touch (pointer-capture / `touch-action` / momentum) can't be reached headless, so
it stays **UNVERIFIED** per HARD RULE #23.

**Changing shared Studio chrome — the selector-drift checklist.** Many specs
target controls by accessible name (`getByRole('button', { name: 'Deck scope' })`,
`getByRole('status')`), an implicit contract centralized in
`docs/e2e/studio-fixture.ts` (the `CHROME` map + `openInspector` / `appToast`
helpers). Before merging any change to a control's **accessible name, role,
presence, or location**:

1. Update the `CHROME` map (and helpers) in `studio-fixture.ts` — route the
   selector through it so a rename is a one-file fix, not an N-spec sweep.
2. `grep -rn "<old accessible name>" docs/e2e` — repoint or retire **every** hit
   (sweep the class, not the one line a reviewer flagged).
3. Watch for **role collisions** — a new `role="status"` / `role="dialog"` can
   make an existing `getByRole` ambiguous (this is what forced `appToast` to
   scope to `.fixed.inset-x-0`).
4. Update **both** tiers — unit **and** e2e — and run `npm run test:e2e:smoke`
   (or the touched specs). State in the PR whether the e2e suite was actually run.

The `@smoke`-tagged subset is a stable, fast (~1 min incl. build) chrome sanity
net. It runs on every docs-touching PR via the **`studio-smoke`** job in
`ci.yml` — but **advisory**: it sits outside the required `ci` gate (like
`golden-diff`), so a red reports fast but doesn't block merge or jam the queue.
Promotion to merge-**blocking** (move `studio-smoke` into `ci`'s `needs`) waits
on an observed nightly green streak per the experience-gating doc's §3 — tracked
in #800. The full suite still runs in the nightly.

**Two things about that streak, before you go counting it.** The nightly workflow
was **schema-invalid** from #1500 until 2026-08-10 — `runs-on` was dropped in a
comment rewrite, so every run was a zero-job startup failure and the cron never
fired. Any streak starts from that fix, not from the workflow's creation date. And
the deterministic `e2e` job now exits **0 by design when specs fail** (the shape
`perf`/`preview-e2e`/`integration` all use, so the artifact and issue steps always
run), which means a green Actions list does **not** mean a green suite. Read the
streak off the rolling `[studio-e2e]` issue's history instead. Both are recorded in
`engineering/decisions/2026-08-10-nightly-invalid-and-silent.md`.

---

## Cross-cutting rules

These are the "when you do X, also do Y" patterns easy to forget.

### Adding or restyling a component layout — check portrait
A new layout (or a CSS change to an existing one) is **landscape-tuned by
default**: every `--fs-*`/spacing token scales off `--_sec-1cqi` = 1% of slide
*width*, so a portrait canvas (`size: portrait` / `story` / `mobile`) yields
smaller type and a different aspect than HD. The `orientation` manifest field is
a *support contract*, not a switch: omitting it (or `["landscape","portrait"]`)
claims the layout works in **both**, and `lint:deck` warns when a deck's `@size`
orientation isn't in that list — in either direction. So when you add or restyle
a "both" layout, actually render it at a portrait `@size` and add the
orientation-aware CSS that makes the claim true (the engine supplies
`--canvas-scale` / `--stat-emphasis` + `data-orientation`; the per-component
reflow is yours). If it is genuinely landscape-only (e.g. a side-by-side diff),
declare `"orientation": ["landscape"]` so the lint tells authors instead of
letting it break silently. See
`engineering/decisions/2026-06-16-orientation-in-the-form-model.md`.

### Editing a component manifest (`<name>.manifest.json`)
The prose/content fields (`sample`, `variants`, `variantDocs`,
`stressSample`) feed TWO generated decks, regenerated by DIFFERENT
commands:
1. the **per-component** gallery `<name>.gallery.md` — regenerated by
   `npm run build` (via `docs:components`) and gated by `build:check` +
   pre-commit (`docs:components:check`).
2. the **per-bucket survey** gallery `<bucket>.gallery.md` — embeds each
   member's `sample`; regenerated ONLY by `npm run build:bucket-galleries`.
   It is deliberately NOT part of `npm run build` (re-rendering the 18
   bucket PDFs is slow), so it lives in CI's `test:integration`.

So a `sample` edit refreshes the per-component gallery but silently
staled the bucket survey until CI catches it. After editing a manifest
`sample`, run BOTH `npm run build` AND
`npm run build:bucket-galleries --only <bucket>`, and commit both. See
gotchas.md → "Editing a manifest `sample` staled the bucket survey."

### Adding a new `lib/<name>.js`
1. Add an entry to `SCRIPT_FOR_LIB` in `tools/affected-tests.js` (else
   pre-commit falls back to the full suite for every edit to that file).
2. Add a unit test at `test/unit/<scope>/<name>.test.js`.
3. If it's a renderer transform, it ships against `lib/engine`; add a
   `lattice-runtime.js` sibling only if it's actually needed for the vscode
   preview, and document either way (per the two-renderer rule in
   `workflow.md`, opt-in since 2026-07-09).

### Editing deck-lint rules
The footgun checks (card-style inline-title, ordered-list bold, split/number
bodyless items, big-number hero-as-heading, bookend-under-finish contrast,
unknown `_class`, …) live in **one place**:
`lib/authoring/lint-core.js` — a pure, `fs`-free, dependency-free module. Three
consumers share it, so edit the rule THERE, never duplicate it:
1. `lib/authoring/lint.js` — the Node binding (`npm run lint:deck`); builds the
   name/modifier vocab from the live manifests and delegates.
2. `lib/components/index.js`'s `validate()` — re-imports the detectors + layout
   sets from lint-core.
3. The **Studio** docs-site editor (`docs/src/pages/studio.astro` +
   `docs/src/components/studio/`) — runs the *same*
   lint-core client-side, with the vocab precomputed at docs-build time. Astro's
   `vite.build.commonjsOptions` applies the CJS→ESM transform so the browser
   imports the CommonJS core.

Tests: `test/unit/components/lint-core.test.js` (the pure API) +
`lint-deck.test.js` (the Node binding). Both routed via `SCRIPT_FOR_LIB`.

**Giving a rule a MACHINE fix, not just prose.** A finding's `fix` string is
guidance for a human to follow by hand; `autofixable` is what turns it into a
one-click button in the editor and makes `applyAllFixes` (Fix all / `--fix`) act
on it. Two ways to earn it:

- **A line rewrite** — add an arm to `fixReplacement(finding, line)` returning
  the replacement text, the way `autofixNestedTitle` and `autofixGanttDelimiter`
  do. Use this when the fix reshapes the line.
- **A token swap** — wrap the finding in `withTokenSuggestion(finding,
  candidates)`. It runs the bounded `nearestRegion` "did you mean" over the
  candidate list and, when exactly one is close enough, attaches
  `autofixable: true`, `didYouMean`, and a structured `replace: { from, to }`
  that `fixReplacement` applies with `replaceToken` (whole token, never a
  substring). This is what every `unknown-<register>` validator uses, so a typo'd
  `finish:` / `mode:` / `_class:` value is one click rather than a list to read.
  Nothing close enough → the finding is returned untouched and keeps its prose.

The suggestion rides on `didYouMean`, NOT folded into `message`: the message is
what every surface prints and asserts, and the suggestion belongs on the button
(`Fix: use “kpi”`), where it says what pressing it will do.
`docs/src/playground/editor-diagnostics.js` prints the prose `fix` **only** when
there is no button — printing both is what #1658 reported as the tool knowing the
answer and making you type it anyway.

### Adding a new theme (`themes/<name>.css`)
No script change needed — `affected-tests.js` routes `themes/*.css` to
`test:palette` automatically. Just:
1. Drop the file with the required tokens (see `theming.md`).
2. `npm run test:palette` verifies WCAG contrast.

### Adding a new npm test script
Update the *Test layout* and *Quick reference* tables above, and update
the *Inner-loop scoping* table in `workflow.md`. The two docs reference
the same scripts but for different audiences (humans following PR
process vs. anyone configuring tooling).

### Renaming a test scope directory
The directory name is the script name (`test/unit/palette/` →
`test:palette`). Renaming requires updating:
1. `package.json` scripts
2. `tools/affected-tests.js` (the mapping)
3. `workflow.md` (the scoping table)
4. This file (the *Test layout* + *Affected tests* sections)

### Bumping the minimum Node version
1. `engines.node` in `package.json`
2. `.nvmrc` (if you want devs on something newer too)
3. CI matrix in `.github/workflows/ci.yml`
All three should move together — drift between them is what caused the
original `node --test <dir>` outage.
