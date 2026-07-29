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
- **`engines.node` = `>=22.0.0`** — declared supported minimum.
- **CI matrix = `[22, 24]`** — verifies the engines claim. The FULL unit suite
  runs on 22; on 24 a representative smoke subset (core/engine/parsing/contracts/
  transformers/export) confirms cross-version compat without paying 2× the whole
  suite. Widen the 24 subset if a Node-version-sensitive area grows.

Drop a version from the matrix iff you also bump `engines`. Bump `engines`
iff you drop a version from the matrix. The original cause of the
`node --test <dir>` outage that started this whole overhaul was
matrix=Node-18 while devs ran Node 22 — keep the three numbers aligned.

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
test/integration/export/      export-formats                            [PR]
test/integration/invariants/  component-invariants (semantic gate)      [PR]
test/integration/galleries/   emulator.gallery                      [nightly]
test/integration/components/  component- + bucket-galleries          [nightly]
test/integration/exemplars/   exemplar-render (45 decks)            [nightly]
test/integration/mermaid/     mermaid-smoke                         [nightly]
test/integration/screenshot/  screenshot, svg-scaling              [nightly]
test/benchmark/               engine-bench.mjs (npm run bench; not in npm test)
test/helpers/                 render.js, pdf.js, palette.js
test/fixtures/                small .md decks for integration
```

`[PR]` suites gate every `code` PR via `test:integration:pr`; `[nightly]` suites
run on `main` via `integration-nightly.yml` (`test:integration:nightly`). The
split keeps shared-kernel wiring, the export pipeline, and the computed-style
correctness gate blocking, and moves the slow fresh-render regression suites off
the PR critical path — their stale-committed-artifact half is already backstopped
at pre-commit, so a next-morning catch on `main` is cheap to revert. Rationale:
`engineering/decisions/2026-06-27-integration-nightly-split.md`.

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

When a staged file isn't recognised, the script falls back to the full
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
**Drawing Board**, the **Workbench**, the **Playground**, and the component
pages. **You can build, run, AND screenshot it in the cloud sandbox** — this
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
node tools/screenshot.js http://127.0.0.1:4321/drawing-board/ \
  .scratch/shots/drawing-board.png --width 1440 --height 900
```

`tools/screenshot.js` drives the puppeteer-cached Chromium
(`--no-sandbox`; resolves the binary from `CHROME_PATH` or the puppeteer
cache). Flags: `--width`/`--height`, `--full` (full-page), `--wait <css>`
(wait for a selector — useful for the Drawing Board's hydrated panels),
`--delay <ms>`. Write PNGs under `.scratch/` (gitignored, 14-day GC).

### Routes

| Route | URL |
| --- | --- |
| Landing | `http://127.0.0.1:4321/` |
| Drawing Board | `…/drawing-board/` |
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
second copy, and the icon carries New deck / Drawing Board / Docs shortcuts.
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
  guard: loads every converted surface at **390 / 820 / 1440**
  (mobile/tablet/desktop), exercises the interaction states (drawer/pane
  switches, overlay opens), and fails if any page is wider than its viewport (a
  pannable page breaks on touch). Needs a built `dist/` + `CHROME_PATH`.
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
```

The pinned Chromium is **pre-installed** at `PLAYWRIGHT_BROWSERS_PATH=
/opt/pw-browsers` (build 1194 ↔ `@playwright/test` 1.56.1) — do **NOT** run
`playwright install`. Two things genuinely can't run here: the `@visual`
snapshot bless (runner-specific AA) and the PDF-export journeys (need the
Google-Fonts CDN the sandbox blocks) — those stay nightly/UNVERIFIED locally,
per HARD RULE #23. `CHROME_PATH` is the *Puppeteer* cache and is irrelevant to
Playwright.

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
3. The **Drawing Board** docs-site editor (`docs/src/pages/drawing-board.astro`
   + `docs/src/playground/drawing-board-architect.js`) — runs the *same*
   lint-core client-side, with the vocab precomputed at docs-build time. Astro's
   `vite.build.commonjsOptions` applies the CJS→ESM transform so the browser
   imports the CommonJS core.

Tests: `test/unit/components/lint-core.test.js` (the pure API) +
`lint-deck.test.js` (the Node binding). Both routed via `SCRIPT_FOR_LIB`.

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
