---
status: shipped
summary: >-
  A bundled artifact must not freeze a file its runtime twin reads from disk.
  `lib/components/index.js` read manifests off disk at run time but `require`d
  `manifest.schema.json`, which esbuild inlines — so `dist/lattice-emulator.js` checked the
  live tree against a schema from the day it was built, and rejected manifests the loose
  source accepted with an error naming a field the schema already had. The schema is read
  from `PKG_ROOT` now, the same directory `lattice-emulator.js` hands `loadAll()`; the
  `require` stays as the fallback for a tree with no `lib/`. Two ordering defects of the
  same family, both in `tools/build.js`: `build-anima-player.js` ran 18 steps after the
  emulator that inlines its output (measured: the emulator written 2.6s before the file it
  contains, so one build could not converge), and `build-player-core.js` bundled
  `@laticent/cadenza` six steps ahead of the join that awaits it — a real race, won today
  by 5.7s of scheduling luck. Neither was visible to a gate: `dist/` is gitignored and
  `build:check --exclude-uncommitted` skips the built-not-committed artifacts by design.
builds-on: 2026-08-17-theme-css-is-a-preview-sink.md
---

# The bundle and the tree were two different eras

## What was reported

`dist/` looked stale at session start, `test/unit/components/code-line-width.test.js`
failed in a fresh sandbox until a rebuild, and the SessionStart hook's ordering looked like
a race: it appeared to build `lattice-emulator.js` 32 seconds before it wrote
`lib/components/manifest.schema.json`.

## What the hook actually does

Nothing in the build writes `lib/components/manifest.schema.json`. It is hand-authored and
committed; a full `npm run build` leaves its mtime untouched (measured: unchanged at
`13:11:39` before and after a complete build). Its fresh mtime at session start came from
`git checkout` — the
reflog records the branch checkout at 13:11:39, and commit `fa181c9` does touch that file.
The hook's build wrote `dist/lattice-emulator.js` at 13:12:24, **45 seconds after**. The
hook's own order was correct.

The symptom was real anyway, and the reported shape — a bundle that cannot validate a
manifest the source accepts — reproduces exactly. The cause is not ordering.

## Root cause: two eras inside one module

`lib/components/index.js` read its two inputs from different points in time.

| Input | How it was loaded | When it was fixed |
|---|---|---|
| `lib/components/**/*.manifest.json` | `fs.readdirSync` / `fs.readFileSync` in `loadAll` | run time |
| `lib/components/manifest.schema.json` | `require('./manifest.schema.json')` | **bundle time** — esbuild inlines a relative `require` |

So `dist/lattice-emulator.js` validated the live tree's manifests against whatever the
schema said on the day the bundle was built. Any skew between `dist/` and the tree — the
normal state of a warm container between a checkout and the hook's rebuild — breaks
validation, in both directions. The reverse case is worse for being quiet: a frozen LOOSER
schema accepts a manifest the tree would reject.

Reproduced by adding `probeKey` to `title.manifest.json` **and** to `manifest.schema.json`
without rebuilding:

```
source  node lattice-emulator.js …       → exit 0
bundle  node dist/lattice-emulator.js …  → Error: Invalid manifest:
        lib/components/anchor/title/title.manifest.json: unknown manifest key 'probeKey'
        — not in manifest.schema.json (the schema is the source of truth; add the field there first)
```

The error is the cruel part. It tells the author to add a field to the one file that
already has it.

## The rule this file exists to state

**A module that reaches `dist/` may not `require` a file whose twin it reads from disk.**
Read both from the same root, or inline both.

The house already knew this. `lattice-emulator.js:92` says it for `package.json`:
*"`require('./package.json')` would look correct, but esbuild treats it as a local relative
import and inlines the WHOLE manifest into the bundle."* Written for a different
consequence — a bundle going byte-stale on a dependency bump — and never generalized.
`manifest.schema.json` is the case it missed.

## The fix

The schema is read from `PKG_ROOT` at load time, falling back to the inlined `require`.
One path serves both entry points: the package-root walk crosses no nested `package.json`,
so from `lib/components/index.js` and from `dist/lattice-emulator.js` it lands on the same
root, and `PKG_ROOT/lib/components` is the directory `lattice-emulator.js:2006` already
passes to `loadAll()`. Schema and manifests are one era by construction rather than by
coincidence of build order.

The fallback is not decoration: esbuild still inlines it, which is what keeps the bundle
working if `lib/` is ever absent. `package.json` `files` ships `lib/` today, so it is a
belt.

Cost: one 53 KB read + parse per process, measured at 0.28 ms.

**The fallback catches ENOENT and nothing else silently**, and that narrowness is the fix
rather than a detail of it. A blanket catch reinstates the bug in a form with no symptom: a
schema carrying one fat-fingered comma parses in neither place, but the loose source
rethrows from `require` and shows the author their typo, while a swallowed `SyntaxError`
puts the bundle back to validating the live tree against the build-day schema — silently,
and ending in the same misleading `unknown manifest key` error. So anything but a missing
file is announced through `process.emitWarning`, naming the file, the parse error, and the
consequence.

**That is the BUNDLE's behavior, and the two surfaces differ** — a distinction the first cut
of this note and the warning text both blurred. In `dist/lattice-emulator.js` the fallback
`require` is an esbuild-inlined object, so the warning is followed by a normal render: a
present-but-unreadable schema (EACCES on a locked-down install) is heard, not fatal, and
since `package.json` `bin` is the bundle, that is what a consumer gets. In the LOOSE SOURCE
the fallback re-reads the same broken file, so the warning is followed immediately by the
underlying `SyntaxError`/`EACCES` and the process dies. That is the right outcome for a
developer — the error names the file and the position — but it means the warning's own
sentence ("validating manifests against the schema bundled at build time") is only true on
the bundle. The text now says which surface it is on.

The package-root walk is SHARED (`lib/core/pkg-root.js`). **Correction, 2026-09-13:** the
first cut of this note, of `pkg-root.js`'s own docblock and of #2162 all said it "was two
byte-identical walks". That was false and it described this change's own unshipped draft,
not the repository. The walk existed ONCE, inline in `lattice-emulator.js` —
`git log --all -S "dirname(dir)" -- lib/components/index.js` is empty, and
`git grep "dirname(dir)" 9f9d0eb -- '*.js'` returns only `lattice-emulator.js`. The draft
added a second inline copy here; a checker caught it and it was extracted before shipping.
So this is a NEW shared helper that stops a second copy from existing, not a HARD RULE #15
de-duplication of one that did. The extraction is still the right call for the same reason —
the guarantee must not rest on two implementations agreeing — but the justification is
forward-looking, not historical.

Scope check — only `dist/lattice-emulator.js` inlines `lib/components/index.js`. No browser
bundle does (`layout-core.generated.js` inlines the schema JSON directly via
`lib/layout/gate.js`, not this module), so the disk read adds no constraint the module did
not already have: it required `node:fs` at the top before this change.

## Two ordering defects of the same family

Both found by asking the question the era split raises: what else does a bundle inline that
something later rewrites? Grep the esbuild module markers — `grep -n '^// lib/'` on each
bundle — and check each generated input against its step index.

**1. A deterministic inversion.** `dist/lattice-emulator.js` is STEPS index 8 and inlines
`lib/export/anima-player-bundle.generated.mjs`, generated at index 26. Measured on a real
`npm run build`: emulator written `13:20:46.653`, the anima bundle `13:20:49.245` — the
emulator carried the file 2.6 seconds before that file existed in its current form. One
`npm run build` could not converge when an Anima source changed; it took two. Nothing
caught it, because `dist/` is gitignored and `build:check --exclude-uncommitted` skips the
emulator by design. Fixed by moving the generator ahead of the bundles, beside dagre, which
is there for exactly this reason.

**2. A genuine race.** `build-player-core.js` (index 27) inlines
`docs/src/lib/cadenza/dist/index.mjs`, produced by `build-cadenza-lib.js` — a BACKGROUND
step awaited only at index 33. Nothing made player-core wait; it read a file a live child
process could be rewriting. `tools/build.js` asserted the opposite in its own comment: the
library dists "have no ordering dependency on anything EXCEPT read-along-core". Measured
margin today: cadenza's dist written `13:20:43.665`, player-core `13:20:49.325` — **5.7
seconds, won by scheduling luck, not by construction.** A slower `tsc`, a colder container,
or one step moved earlier flips it. The same dependency in its serial form is already on
the record: `build.js`'s bootstrap loop hit `Could not resolve "@laticent/cadenza"` for
precisely this reason and was fixed there only. Fixed by joining before the FIRST consumer
(`JOIN_BEFORE_SCRIPTS`), joining once so a background failure is not double-counted.

## What moving the Anima step costs

`build-anima-player.js` is a DOCS-tree build (`docs/src/lib/anima/**`) and it now runs at
step 7, ahead of both engine bundles. So a build failure in that step aborts `npm run build`
before `dist/lattice-runtime.js` and `dist/lattice-emulator.js` exist, where before it
aborted at step 26 with both already written. On a cold sandbox — the case this note is
named for — that is the difference between a session with no engine bundles and a session
with a working CLI and one missing generated file.

**Correction, 2026-09-13: this first said "a TypeScript error", and that is wrong.**
`build-anima-player.js` runs **esbuild only** — no `tsc`, no `spawn` (grep the file). esbuild
STRIPS types; it does not check them. Measured: `esbuild.build` on
`const n: number = "a string"` with `loader: 'ts'` exits 0 and emits output. A real type
error under `docs/src/lib/anima/**` is silently compiled away and inlined into
`dist/lattice-emulator.js`, exactly as before this change — the step cannot produce the
failure the tradeoff was written against. What it CAN fail on, and therefore what this
reordering actually costs, is narrower: a **syntax error, an unresolvable import, or an
esbuild crash**. The tradeoff still holds on that narrower set — a loud abort beats a stale
inline — but it is a smaller set than stated, and the claim reached a reviewer and a merge
before anyone re-derived it, in a note whose whole subject is claims nobody re-derives.

Taken deliberately. The alternative is the bundle shipping a stale copy of that file, which
is silent, survives the build, and is the defect above. A loud abort is the better failure.
The step's own inputs are clean either way: its full esbuild graph is `docs/src/lib/anima/**`,
`docs/src/lib/chart-anima*.ts`, `docs/src/playground/anima-host-sel.ts`, plus `animejs` and
`zdog` — no generated file, no workspace dist, and both packages are declared in the ROOT
`package.json`, so the step does not depend on a separate `docs/` install having run.

## Verification

Both arms, on the real CLI against a real Chromium render — not a harness (HARD RULE #23):

- **Positive** — manifest and schema both carry `probeKey`, `dist/` not rebuilt since:
  source exit 0, bundle exit 0. This was the failure before the change.
- **Negative** — manifest carries `probeKey`, schema does not: both reject, with the same
  message. Validation is not weakened.
- **Convergence** — a side-effecting probe in `docs/src/lib/anima/hydrate.ts`, then ONE
  `npm run build`: the probe is in `lib/export/anima-player-bundle.generated.mjs` **and** in
  `dist/lattice-emulator.js`. Before the change the same probe scored 1 and 0.

## What is still unguarded

No gate proves a bundle's inlined inputs are generated before it. The check is mechanical —
compare each `^// <path>` marker against the producing step's index — and it is a good
candidate for `check-ownership.js`. It is not in this change because adding a build gate is
a decision about what every future PR pays for, which belongs to the repo owner.
