---
status: proposed
summary: >
  Give Cadenza and Vetrina real LIBRARY SHAPE today — a per-lib package.json (name, exports,
  types) plus a build emitting CJS + .d.ts to each lib's dist/ — so root CJS consumers can
  require() the REAL engine, WITHOUT publishing or relocating them yet. They are already
  library-SHAPED (self-contained, zero-dep for Cadenza, boundary-gated by checkCadenzaBoundary /
  checkVetrinaBoundary, README + standalone tests) but UNBUILT and UNREACHABLE from root CJS.
  DECISION (revised after an adversarial pass falsified the first draft — see "What the red team
  broke"): (1) add the libs to an npm WORKSPACE so root resolves `@slidewright/cadenza` BY NAME
  (a bare co-located package.json does NOT make root require() work and silently flips Vite/Vitest
  onto dist/); (2) the `exports` map points `import`/`types` at the SOURCE `./index.ts` and only
  `require` at `./dist/index.cjs`, so the docs toolchain stays on source (no split-brain) while
  root CJS gets the built engine; (3) BUILD with the esbuild already in-tree + `tsc
  --emitDeclarationOnly` for the `.d.ts` — NOT a new tsup devDep (capabilities.md names esbuild the
  house bundler; HARD RULE #15); (4) commit the dist/ (un-ignoring it past docs/.gitignore) and
  freshness-gate it; (5) Cadenza FIRST. The CJS build is what retires the hand-mirrors (voice-model
  splitSentences, read-along-vtt trackToVtt) and unblocks CLI/PDF captions. Spin-off later = move
  the dir out + npm publish. npm publish + the packages/ monorepo move remain explicit NON-GOALS.
  Companion to the Cadenza + Vetrina ADRs.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-08-read-along-export-manifest.md
---

# Library shape today, npm spin-off later — Cadenza & Vetrina (2026-07-08)

> **Goal (the architect's words).** Give both Cadenza and Vetrina *library shape today* and spin
> them off into their own npm-published libraries at a later date. This doc is the plan to make
> them **node-consumable, publishable units now** — without publishing and without relocating them.

## Where they stand

Both `docs/src/lib/cadenza/` and `docs/src/lib/vetrina/` are already **library-shaped**:
self-contained, each guarded by an ownership gate that bars any import outside `./`
(`checkCadenzaBoundary`, `checkVetrinaBoundary` in `tools/check-ownership.js`), each with a README,
a barrel (`index.ts`), and standalone tests. Cadenza is zero-dependency; Vetrina has exactly one
external — `react`, imported *only* by its sanctioned `react.ts` adapter (the gate's
`VETRINA_ADAPTER_DEPS` allowlist).

What they are **not**: built, and **not reachable from root CJS**. They are docs-side TypeScript,
consumed only from `docs/src/**` (via `@/lib/cadenza` / relative imports). A root CJS consumer —
`lib/export/html-player.js`, the CLI emulator, `lib/core/read-along-vtt.js` — can't touch them.
That is exactly why the read-along work grew **hand-mirrored** copies of two pure functions
(`voice-model`'s `splitSentences`, `read-along-vtt`'s `trackToVtt`), each pinned byte-identical to
its Cadenza original by a parity test.

The boundary gates are the crucial part, and they already exist: **the "no import outside `./`"
invariant is the spin-off contract.** The remaining gap is purely packaging + reachability.

## What the red team broke (why this is a revised plan)

The first draft of this doc said "just add a per-lib `package.json` + a tsup build, in place;
consumers are unchanged." An adversarial pass (red team + independent checker, HARD RULE #25) ran
the repo's *own* installed Vite / esbuild / tsc against that shape and **empirically falsified its
three load-bearing claims.** They are recorded here so the corrected plan doesn't relitigate them:

1. **"Consumers unchanged" was false — a co-located `package.json` splits the docs toolchain.**
   Docs import the *directory* (`@/lib/cadenza`, `../vetrina`). The moment that directory carries a
   `package.json` with an `exports` map, the resolvers **disagree**: Vite/Rollup (hence `astro
   build` **and Vitest**) load `dist/`, while `tsc` and esbuild load `index.ts`. Result: the docs
   site + its unit tests silently run the *built* output while typecheck validates *source* — a
   split-brain with no gate to catch the drift, and **non-deterministic by disk state** (dist
   present → stale build; absent → Vite falls back to source). This directly violated the draft's
   "docs runtime unaffected" invariant.
2. **The payoff didn't work — root can't `require()` the lib by name.** Root `package.json` has no
   `workspaces` and the libs live under `docs/`'s module world, so `require('@slidewright/cadenza')`
   from `lib/core/` → `MODULE_NOT_FOUND`. The only resolvable path was a hardcoded
   `require('../../docs/src/lib/cadenza/dist/index.cjs')`, which *reverses the layering* (root
   engine depending on `docs/src/**`) and bypasses the `exports` map entirely.
3. **Committing `dist/` collided with `.gitignore`.** `docs/.gitignore` ignores `dist/` at any
   depth (`git check-ignore` confirms `docs/src/lib/cadenza/dist/index.cjs` is IGNORED), so there
   was nothing for a freshness gate to diff.

Two smaller findings folded into the decision below: **tsup is redundant** with the in-tree esbuild
(its only real edge is `.d.ts` rollup — get that from `tsc`), and **Vetrina is not "same recipe"**
(two entrypoints, `react` must be external / a `peerDependency`). The one claim that *held*: adding
`package.json` + `dist/` does **not** trip the boundary gates (`package.json` isn't scanned, `dist/`
is skipped) and dual-package is safe (both libs are pure / name-based, no cross-boundary
`instanceof`).

## Decision

1. **npm workspace, not a bare co-located manifest.** Add the two lib dirs to the root
   `package.json` `workspaces` so root's module graph resolves `@slidewright/cadenza` /
   `@slidewright/vetrina` **by name**. This is what makes `require()` work (finding #2) — a
   co-located `package.json` alone does not, and it is what earns the `exports.require` path a real
   consumer.
2. **`exports` map that pins the docs toolchain to source.** `import` + `types` → the **source**
   `./index.ts`; `require` → the built `./dist/index.cjs`. Because Vite/tsc honor `exports`
   conditions, pointing the condition *they* consume at source keeps docs + Vitest on the TS you
   edit (kills the split-brain of finding #1), while root CJS resolves `require` to the built
   engine. `sideEffects: false`, `license`, `files`. (An ESM `.ts` entry is intentionally *not*
   node-consumable yet — that's fine: publish is a non-goal, and the CJS entry is the one root
   needs today. At spin-off the `import` condition flips to a built `./dist/index.js`.)
3. **Build with the house bundler, add no tool.** Emit `dist/index.cjs` with the **esbuild already
   in-tree** (`engineering/capabilities.md` names it the bundler; root already drives it in
   `tools/build-authoring-core.js`), and the `.d.ts` with `tsc --emitDeclarationOnly`. This is
   tsup's value (esbuild + declarations) without a new devDep — respecting HARD RULE #15 /
   `capabilities:check`. Register the new build script in `SCRIPT_META`.
4. **Commit `dist/`, freshness-gate it.** Un-ignore `docs/src/lib/{cadenza,vetrina}/dist/` past
   `docs/.gitignore` (re-include the full path — a bare `!dist/` under an ignored parent won't
   work), commit the built artifact (HARD RULE #2: generated, never hand-edited), and add a
   freshness step to `build:check` modeled on the existing generator + `--check` pattern
   (`tools/build.js`).
5. **Cadenza first**, then Vetrina — Cadenza is on the export critical path (its CJS build retires
   the mirrors and unblocks CLI/PDF captions). Vetrina follows with **two entrypoints**
   (`index.ts` + `./react`) and `react`/`react-dom` marked **external** + declared
   `peerDependencies`.

## What changes, what doesn't

- **Docs consumers today:** unchanged *in behavior* — and now guaranteed so by construction (the
  `exports` `import`/`types` condition resolves to source, verified against the installed Vite).
  Slice 1 still carries a before/after `astro build` + `vitest run` check as belt-and-suspenders.
- **Root CJS / export pipeline:** once Cadenza is a workspace with a CJS `dist/`, `lib/export/*` and
  the CLI `require('@slidewright/cadenza')` the built engine by name. The hand-mirrors
  (`splitSentences`, `trackToVtt`) become deletable — one source of truth, parity tests retired.
- **The gates:** stay. They are the spin-off boundary; the build must not weaken them, and it
  doesn't (verified — `package.json`/`dist/` are invisible to the boundary scan).

## Invariants

1. **The boundary holds.** No lib imports anything outside its own `./` (except the sanctioned
   Vetrina react adapter). The build consumes only in-lib source. *(Verified: unaffected by the new
   files.)*
2. **Docs runtime is unaffected — by construction, not by hope.** The `exports` condition the docs
   toolchain consumes points at source; a before/after check on `astro build` + `vitest run`
   confirms it in slice 1.
3. **`dist/` is generated, never hand-edited** (HARD RULE #2), un-ignored explicitly, and its
   freshness is gated like every other build artifact.
4. **No publish, no move.** `npm publish` and the `packages/` relocation are out of scope; this is
   shape + reachability only.

## Non-goals

- **Publishing to npm** — later, deliberately, with a version/release process of its own (and the
  `exports.import` flip to a built ESM entry).
- **The `packages/` monorepo move** — that is the spin-off; deferred until we actually extract. (A
  workspace entry is *not* that move — it's a root-package resolution edge, zero import-path churn.)
- **Rewriting consumers** — docs imports stay as-is, on source.

### ⚠ Publish prerequisite — the shipped `lattice` bin `require`s `@slidewright/cadenza`

Because `@slidewright/cadenza` is a **workspace** package (not in root `dependencies`, not published),
it resolves ONLY via the in-repo `node_modules/@slidewright/cadenza` symlink. Since the read-along
export work, the shipped root CJS `require`s it: `lib/core/read-along-vtt.js` and
`lib/core/read-along-build.js` (both in the published `files: ["lib/"]`), and the `lattice` bin hits
that path at runtime under `--captions`. **In-repo this is fine** (the symlink is present; the bundled
`dist/lattice-emulator.js` keeps the require external). **But a plain `npm publish` + `npm i -g` — or a
Tauri desktop package that ships `dist/`+`lib/` without the workspace `node_modules` — would
`MODULE_NOT_FOUND` on `--captions`.** So, as a hard prerequisite of the eventual publish (and of any
desktop packaging), one of: **(a)** bundle Cadenza into the emulator (drop `@slidewright/cadenza` from
`tools/build-emulator.js`'s `packages: 'external'`, e.g. via an esbuild alias to its built `dist/index.cjs`
— then reorder `tools/build.js` so `cadenza-lib` builds before the emulator), or **(b)** publish
`@slidewright/cadenza` and declare it a real `dependency`. Tracked here rather than fixed now, since
publish + packaging are the non-goals above (HARD RULE #18: off-path, logged not pulled into the diff).

## Build order (slices, each its own PR, each builds/tests against `main` alone — HARD RULE #17)

1. **Cadenza workspace + build** — add the workspace entry, `package.json` (`exports` split), the
   esbuild + `tsc --emitDeclarationOnly` build script (registered in `SCRIPT_META`), the un-ignore,
   the committed `dist/`, and a `build:check` freshness gate. Boundary gate stays green; before/after
   docs-build + Vitest check proves invariant #2.
2. **Retire a mirror** — point `lib/core/read-along-vtt.js` at the built Cadenza `toVtt` via
   `require('@slidewright/cadenza')`, delete `trackToVtt` + its parity test. Proves the by-name CJS
   path end-to-end. (Gated on slice 1 landing in `main` — sequential, not stacked.)
3. **Vetrina workspace + build**, same recipe + the two-entrypoint / react-external specifics.
4. **(Unblocked) the CLI/PDF read-along `.vtt`** — now that Cadenza is CJS-importable by name, wire
   `buildReadAlong` + `toVtt` into the export command (the slice this whole detour unblocks).

Until slice 1 lands, the hand-mirrors stay (they're correct and pinned); this doc commits to
retiring them via the workspace build rather than growing more.
