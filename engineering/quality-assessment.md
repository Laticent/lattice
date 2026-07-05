# Codebase quality assessment

An on-demand diagnostic over seven structural-health signals — the kind of
thing that doesn't break a test today but quietly taxes every change from
here on. Run it, read it, triage what it finds; it never blocks a merge by
itself.

## The seven dimensions, and what measures them

| # | Dimension | Tool |
|---|---|---|
| 1 | Structural coupling — who imports whom | `dependency-cruiser` |
| 2 | Architectural boundary violations | `dependency-cruiser` (custom rules) |
| 3 | Circular dependencies | `dependency-cruiser` (`no-circular`) |
| 4 | Change coupling — files that keep changing together in git | `tools/change-coupling.js` (bespoke) |
| 5 | Complexity — functions/files doing too much | `tools/complexity-report.js` (bespoke) |
| 6 | Duplication | `jscpd` |
| 7 | Dead exports/files | `knip` |

One tool (`dependency-cruiser`) covers dimensions 1–3 because they're really
one dependency graph read three ways: the raw edges (coupling), a `to:
{circular: true}` rule (cycles), and a set of `forbidden` rules encoding the
directions `lib/` is *supposed* to flow in (boundaries). Dimensions 4 and 5
have no ready-made Node tool that fit this repo's shape (plain CJS, no
existing dependency-graph tooling — see the "why not X" note below), so
they're small bespoke scripts instead.

## Running it

```
npm run quality          # print a summary, write full per-tool reports
npm run quality -- --json  # machine-readable summary
npm run quality:bless    # (re)write the committed baseline
npm run quality:check    # compare the current run against the baseline
```

- **`npm run quality`** runs everything and writes each tool's full raw
  output to `.scratch/quality-report/*.json` (gitignored — regenerate any
  time; nothing there is meant to be read by a human directly except when
  debugging the tooling itself). The printed summary is the human-readable
  entry point.
- **`npm run quality:bless`** writes the numeric summary to the committed
  `test/quality/baseline.json` — the ratchet. This is the file a
  quality-improving PR updates, the same way `bench:bless` and `scorecard`
  work (HARD RULE #19's baseline-diff pattern).
- **`npm run quality:check`** re-runs the assessment and fails (exit 1) if
  any baseline metric got *worse*. **On-demand, not a blocking CI gate** —
  these seven signals are advisory and evolve continuously; a hard gate here
  would either rot into `--no-verify` bypasses or freeze the codebase at
  today's (imperfect) shape. Run it yourself before a PR that touches a lot
  of `lib/`, and re-bless deliberately when a change is expected to move a
  number (the PR is where that's justified, exactly like a perf re-bless).

Individual sub-tools also run standalone for a faster, narrower loop:

```
node tools/change-coupling.js --json --since=2025-01-01
node tools/complexity-report.js --min-complexity=20
npx depcruise --config .dependency-cruiser.cjs --output-type json lib tools lattice-emulator.js
npx jscpd --config .jscpd.json
npx knip
```

## Reading the results

**Structural coupling / cycles / boundaries.** `.dependency-cruiser.cjs`
derives the bucket list from `lib/components/` *at config-load time* rather
than hardcoding it — CLAUDE.md's own "12 component buckets" line has already
drifted from the live filesystem once (there are 13 today; `connect` isn't
in the doc). A hardcoded regex here would rot the same way. The boundary
rules:

- `component-no-cross-bucket-reach` (error) — a component may reach its own
  bucket's underscore-prefixed shared kernel (`_qr-card`, `_chart-family` —
  sanctioned shared infra, see `design/design-system.md`), `lib/core`, or
  `lib/transformers`, but never another bucket's *named* component directly.
- `core-no-component-imports` (error) — `lib/core` primitives are meant to
  be component-agnostic (`engineering/architecture.md`); a `lib/core` module
  importing from `lib/components` inverts that.
- `kernel-no-transformer-imports` (warn) — `lib/transformers` is the
  adapter/registry layer that wires kernels into render paths; a kernel
  importing *from* it would invert the wiring.
- `foundational-no-upward-imports` (warn) — `lib/base`, `lib/tokens`,
  `lib/helpers` are meant to be leaf modules. Warn, not error: this
  direction is synthesized from doc context rather than one explicit
  written rule, so triage each hit instead of treating it as automatic.

**Change coupling** is reported but **deliberately excluded from the
baseline/`--check` comparison.** Its signal strength depends entirely on how
much git history is available — a shallow clone (common in CI sandboxes;
check with `git rev-parse --is-shallow-repository`) truncates it to whatever
commits happen to be fetched, which has nothing to do with whether the code
actually got better or worse. Read it as informational context, and re-run
with more history (`git fetch --unshallow`) before trusting it for a real
decision. A pair coupling with its own *generated* twin (e.g. a
`lib/theme/*.js` source file and its `docs/src/playground/theme-core.
generated.js` bundle) is healthy, expected coupling, not a smell — read the
list with that in mind rather than flagging every high pair as a problem.

**Complexity** is McCabe cyclomatic complexity (1 + one per `if`/`else
if`/ternary/loop/`catch`/non-default `case`/`&&`/`||`/`??`), computed by
walking an acorn AST — not a fancier cognitive-complexity variant, and not
Biome's `complexity` lint category (which catches style patterns, not a
scored number — see the tool header for why that's a deliberately separate
measurement). A nested function's branches are attributed to the nested
function, not its enclosing one.

**Duplication** (`jscpd`) is exact/near-exact clone detection over `lib/`
and `tools/` (`.jscpd.json`), a minimum-tokens/lines floor to skip
boilerplate-sized matches. Some duplication across `tools/build-*.js`
scripts is this repo's own long-standing, accepted convention (each
build script repeats a small `--check`/`--silent` CLI scaffold rather than
sharing an abstraction over ~90 near-identical-but-not-quite build steps) —
not everything jscpd finds is a refactor candidate.

**Dead exports/files** (`knip`, `knip.json`) needed explicit `entry` points
for anything only reachable through a *generated* string entry rather than a
real file import — several browser-bundle cores (`lib/theme`, `lib/layout`,
`lib/authoring`, `lib/exemplars`, `lib/components/chart/_chart-family`,
`lib/core`) are esbuild-bundled from a template-literal entry point
(`tools/build-theme-core.js` and siblings), which static analysis can't
trace into. Those directories are listed as `entry` globs so their files
aren't false-flagged as unreachable — knip still checks *exports* within
them, just not file-level reachability. `knip` also flags unused npm
dependencies and imports of undeclared ones (`unlisted`); useful bonus
signal beyond the seven core dimensions, reported but not baseline-gated.

## Why these tools, not others

None of the seven dimensions were covered by any existing script or
harness in this repo before this — see `engineering/capabilities.md` (the
generated index of everything that already exists; checked before writing
anything new, per HARD RULE #15). `dependency-cruiser` / `jscpd` / `knip`
are the maintained, widely-used Node tools for graph/duplication/dead-code
analysis respectively; git change-coupling and acorn-based complexity have
no ready-made equivalent that fit a plain-CJS repo with no existing
JS-parsing dependency, so those two are small bespoke scripts instead of a
heavier, less-maintained package (e.g. `typhonjs-escomplex`, last published
2016).

## Design precedent

This follows the repo's own established shape for a diagnostic that
shouldn't be a hard gate — see `bench`/`bench:bless`/`bench:check` (HARD
RULE #19) and `scorecard`/`scorecard:check`: a committed baseline that a
PR ratchets deliberately, a `:check` comparator that runs on-demand, and raw
detail in a gitignored scratch directory rather than committed noise.
`test/quality/baseline.json` mirrors `test/benchmark/baseline.json`'s shape
for exactly that reason.

## First-run results

See `engineering/decisions/2026-07-05-codebase-quality-baseline.md` for the
findings from standing this up — including the two real, non-noisy hits it
turned up on day one.
