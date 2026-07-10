---
status: proposed
summary: Answers "do we maintain two engines, runtime and emulator?" — no. They are two thin shells over one shared core (lib/engine + the kernels + the registry), each an adapter for a different environment: the emulator is the Node CLI that transforms HTML strings (applyToHtml); the runtime is the browser script that mutates the marp-vscode preview DOM (applyToDom). Every transform lives once and exposes both adapters; the only genuine duplication is a small, test-pinned set of sibling functions forced by "the browser bundle can't require a Node module" (the Mermaid theme-var map, orientation math, overflow, the state-token decoder). The real wart is the NAME: "emulator" meant "emulates the HTML Marp CLI produces because we can't install marp-cli here", but Marp was retired as a render path in P4, so the file no longer emulates anything — it IS the engine's CLI (the published bin is already `lattice`). Two proposed moves, each its own PR (HARD #17): (1) rename lattice-emulator.js → the engine CLI and scrub the "emulates Marp" framing; (2) collapse the duplicated Mermaid var-map into one shared data module both resolvers consume. The behaviour siblings stay (test-pinned, environment-forced).
---

# Runtime + emulator — one core, two shells (consolidation review)

**Date:** 2026-06-25 · **Status:** Proposed · **Decision owner:** maintainer ·
**Touches:** `lattice-emulator.js`, `lib/runtime/index.js`, `engineering/architecture.md`

## 0. The question

> *"One [the runtime] is for including as a script tag in markdown to enable
> rendering in the Marp VS Code extension; the emulator is our command line. We
> are no longer emulating — we are the engine. So: do we need two? Are we keeping
> up two things? Do they share a central core?"* — maintainer, 2026-06-25

The instinct is right on both counts: the name is stale, and it's worth checking
whether two files means two maintenance burdens. The short answer: **they share a
central core — heavily — and are not two engines.** They are two *shells* over one
kernel, each an adapter for a different runtime environment. The genuine
duplication is small, bounded, and test-pinned. The actual wart is the **name**,
not the structure.

## 1. What each one is, today

| | `lattice-emulator.js` → `dist/lattice-emulator.js` (the `bin`) | `lib/runtime/index.js` → `dist/lattice-runtime.js` (the `<script>`) |
|---|---|---|
| Environment | Node CLI | Browser |
| Input | markdown source (a string) | live DOM marp-vscode already rendered |
| Job | parse → render → PDF / PPTX / PNG / HTML | post-process the preview DOM in place |
| Transform surface it calls | `applyToHtml` (string transforms) | `applyToDom` (mutate live nodes) |
| Published as | package `bin`/`main` (command: **`lattice`**) | a `<script src>` for the Marp preview + published HTML |

The decisive fact, from `architecture.md` and `2026-06-11-emulator-on-engine-p2.md`:
**the emulator renders markdown *through `lib/engine`*.** Its old bespoke
`parseSlide` regex parser (~620 lines) was deleted in P2 — Lattice has **one**
markdown implementation, not two. The emulator is the engine's CLI wrapper that
adds the things only a CLI does: arg/palette resolution, Mermaid pre-render
(mmdc/Puppeteer), and Puppeteer→PDF/PPTX/PNG plus the HTML sidecar.

## 2. The shared core is real and large

Both paths `require()` the *same files* for every transform that matters:

- **The engine** — `lib/engine` — canonical for every first-party render path
  (HARD RULE #1; `marp-independence.md` §"render path" table).
- **Transform kernels**, each exposing **both** adapters in one file:
  - `lib/core/*` — split-panels, below-note, resolve-finish, … (structural primitives)
  - `lib/components/<bucket>/<name>/<name>.transform.js` — roadmap, charts, compare-code, …
  - `lib/forms/tile/*` — `meta` / `progress` / `watermark`, self-contained Tiles (#356)
- **The registry** — `lib/transformers/` — the wiring layer both consume through one interface.

**Correction (2026-07-09, Form-migration audit):** `bg-image` does NOT belong
in the "both adapters" list above — it was a stale claim. `lib/core/bg-image.js`
exposes only the emulator/engine-side pair (`liftBgImages` — a markdown
pre-pass — and `wrapImageText` — an HTML post-pass); there is no `applyToDom`
sibling, so the runtime has no DOM equivalent at all. Concretely: the runtime
consumes an already-Marp-rendered DOM, where marp-core's OWN native `![bg]`
handling has already run (our `liftBgImages` markdown pre-pass never executes
on that path — it's markdown-level, and the runtime never sees markdown).
`lib/transformers/image-adaptive.js`'s `applyToDom` (the runtime's adaptive-
composition resolver) looks for `section.querySelector(':scope > .lattice-bg')`
to measure the photo; since that div never exists on the runtime path, every
image slide in live preview is silently pinned to the "clean" floor
composition and never upgrades to whatever composition the actual photo
aspect would produce on export.

**Why this is documented as a known limitation, not fixed:** correctly
reproducing `.lattice-bg`/`.image-text` on the runtime path requires first
reproducing what marp-core's OWN native `![bg]` rendering shape is in a raw
Marp-CLI-rendered DOM — and this sandbox has neither `marp-core` nor
`@marp-team/*` installed (not even as a transitive dependency; see
`lattice-emulator.js`'s own header: *"exists only because Marp CLI cannot be
installed in this build environment"*). Shipping a DOM "upgrade" transform
without the ability to render real Marp output to verify against would be
guesswork, not a verified fix (HARD RULE #23). This needs a follow-up
investigation in an environment where marp-core can actually be installed and
its native background-image DOM shape observed directly, before writing the
`applyToDom` sibling. See `engineering/decisions/2026-07-09-form-migration-audit.md`.

So a new component or a behaviour change is authored **once**, in one kernel, and
both paths pick it up — the engine via `applyToHtml`, the runtime via `applyToDom`.
This is the architecture `2026-05-17-shared-transformer-registry.md` set out to
build, and it's holding.

## 3. What *is* genuinely duplicated — and why it's irreducible

A small, **test-guarded** set of sibling functions, every one forced by the same
hard constraint: *the browser bundle cannot `require()` a Node module*, so a few
pieces of knowledge are expressed twice — once as Node code, once as browser code:

| Duplicated surface | Emulator (Node) | Runtime (browser) | Guard |
|---|---|---|---|
| **Mermaid theme-var mapping** | `MERMAID_VAR_MAP` (a *data* map; resolved offline by parsing palette CSS via `parsePaletteVars`/`resolveTokenExpr`) | `buildMermaidThemeVars()` (the *same* map expressed as code; resolved live via `getComputedStyle` + a probe element) | "verified byte-equivalent in the smoke test" (`architecture.md` §"Where transforms live") |
| **Orientation math** | `orientationFor`/`orientationCss` (`lib/engine/css.js`) | `injectOrientationStyle`/`stampOrientation` | `test/unit/engine/engine.test.js` pins the two against drift |
| **Overflow signal** | emulator post-render measure | runtime overflow watcher | `architecture.md` post-process table row |
| **State-token decoder** | shared kernel / engine path | `stateClassesFor` (runtime copy) | "sibling implementations … must stay in sync" comment |

This is the *irreducible* cost of having both a Node string surface and a browser
live-DOM surface. It is bounded (four items), gated, and not growing.

## 4. The actual wart: the name lies

`lattice-emulator.js`'s own header says it *"Emulates the HTML structure that Marp
CLI produces"* and *"exists only because Marp CLI cannot be installed in this build
environment."* Both statements are now **false**:

- Marp was **retired as a render path in P4** (`2026-06-12-p4-regression-gate-retire-marp.md`;
  `marp-independence.md`: *"Marp is gone as a dependency and as our render path."*).
  The owned engine is the only render path. There is nothing left to emulate.
- The published command is **already `lattice`** (`package.json` `bin`). Only the
  *file* still carries the legacy name.

So the file that the gut flagged — "we are no longer emulating, we are the engine" —
is exactly right. It is the engine's CLI front-end wearing a retired-era name.

## 5. Decision

**Keep two shells. They are not redundant — they are two adapters for two genuinely
different environments (a Node process transforming strings; a browser script
mutating live DOM). That is the correct architecture, not duplicated maintenance.**
The heavy lifting is already shared; do not try to collapse the two into one file.

Two consolidation moves are worth doing; neither changes the bytes of any exported
artifact. Per HARD RULE #17 (one feature = one branch = one PR), each ships
independently:

### Move 1 — rename the file, scrub the "emulates Marp" framing *(its own PR)*

`lattice-emulator.js` → the engine CLI (e.g. `lattice-cli.js`), and rewrite the
file header + `showHelp()` to describe what it is: the engine's command-line
renderer. Mechanical but broad — the rename touches the source file, the build
(`tools/build-emulator.js` → its output names `dist/lattice-emulator.js` /
`.min.js`), `package.json` `bin`/`main`, the parity tool
(`tools/emulator-engine-parity.mjs`), tests (`test/integration/galleries/emulator.gallery.test.js`),
and doc references. The published *command* (`lattice`) does **not** change, so
consumers are unaffected; this is an internal/source rename + an honest header.
Because it touches the published `bin` surface, it deserves a recorded rationale —
this doc — before the code.

### Move 2 — unify the Mermaid var-map duplication *(its own PR)*

The map *shape* (which Mermaid theme key ← which Lattice token) is identical in
both files; only the **resolution** differs (offline CSS parse vs `getComputedStyle`).
Extract the shape into one shared *data* module (e.g. `lib/integrations/mermaid/theme-var-map.js`)
that both consume: the emulator feeds it through `parsePaletteVars`, the runtime
feeds it through its `vc()` probe resolver. This deletes the whole
"verified byte-equivalent by smoke test" drift class — the map becomes single-source,
and the smoke test downgrades from "do two hand-kept maps still agree?" to "does the
one map still cover every key?".

### Explicitly *not* moved

The orientation / overflow / state-decoder siblings stay duplicated. They are
*behaviour*, not data — harder to share across the Node/browser boundary — and are
already pinned by tests against drift. Folding them in would add risk for little
gain; revisit only if one of them starts churning.

## 6. Why this is safe / risks

- **No exported-artifact bytes change.** Move 1 is a rename + comments; Move 2 is a
  refactor that resolves to the same Mermaid theme values. Both stay inside the
  "ordinary CSS/layout work" lane — not the export-sign-off lane — *provided* the
  emulator's golden PDFs render byte-identical. Gate each PR on the
  `tools/emulator-engine-parity.mjs` harness + the Mermaid theming smoke test +
  a rebuilt-PDF spot check.
- **Move 1's blast radius is "find every reference."** A maker-checker pass
  (HARD: a rename across `bin`/build/tests/docs is high-blast-radius) catches a
  missed reference that a green unit run wouldn't — run the checker on the diff.
- **The `dist/` artifact names** (`dist/lattice-emulator.js`) are import-by-name in
  a few places (the `bin`, the export-to-Marp bundle). If the *dist filename*
  changes, keep a thin compatibility shim or update the bundle generator in the
  same PR; if only the *source* filename changes, the dist name can stay until a
  follow-up. Decide the dist-rename scope inside Move 1's PR.

## 7. Not in scope

- Removing the runtime. It is the marp-vscode preview's only post-processor; while
  marp-vscode remains the documented fastest inner loop (CLAUDE.md), the runtime
  stays. (`2026-06-11-emulator-on-engine-p2.md` §"Not in scope" — marp-vscode is
  Scope 2, a separate, larger effort.)
- The behaviour-sibling unification (see §5, "not moved").
- LPM / manifest-driven `transformSection` (#287) — orthogonal.

## 8. Tracking

Cut as a GitHub issue decomposed into the two PRs above (Move 1 rename; Move 2
Mermaid-map unify), `area: engine`, `type: refactor`. This doc is the design of
record; the issue tracks status.
