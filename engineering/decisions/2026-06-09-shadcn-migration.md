---
status: shipped
summary: shadcn/React migration of every docs-site surface, website-only inside docs/ with Starlight kept for docs
---

# shadcn migration — the website (and the shared Laticent UI layer)

> Status: **LANDED — all surfaces merged to `main` (PRs #319–#325, 2026-06-14).**
> Followed by the deck-preview consolidation (#331/#335 — see
> `2026-06-14-deck-preview-consolidation.md`). Read **§0 (v3 ratified scope)**
> first — it overrides anything below it that conflicts. The body (§1–§10) is
> retained as the recon/architecture reference; where v2 assumed a monorepo,
> desktop sharing, or removing Starlight, **§0 supersedes it.**

## 0. v3 — ratified scope (2026-06-14)

The author reviewed the v2 plan plus a fresh three-agent maker-checker recon
(surface inventory · token-bridge feasibility · architecture/risk) and
ratified the following. **These five decisions are the contract; the rest of
this doc is reference.**

1. **Full React rewrite of every surface — but WRAP, don't reinvent, the
   irreducible engine.** Each surface (landing, components reference,
   playground, workbench, drawing board) becomes a real React + shadcn app:
   React owns the DOM tree, the state, and **all** chrome (buttons, dialogs,
   drawers, tabs, menus, cards, selects, badges…). The pieces with **no React
   equivalent and documented solved-bug scar tissue** — the CodeMirror editor
   instance, the `srcdoc` deck-render iframe, the export/PDF/PPTX pipeline,
   driver.js tours, the IndexedDB store — are **wrapped in React lifecycle**
   (single-init `useRef` + cleanup, StrictMode-guarded), **not** reimplemented.
   This is the only way "full rewrite" and "nothing breaks" coexist.
2. **Website-only, inside `docs/`. NO monorepo.** React + Tailwind v4 + shadcn
   are added directly to the `docs/` Astro app. **No** npm-workspace
   conversion, **no** `packages/ui`/`packages/core`, **no** `apps/desktop`,
   **no** deploy rewrite. `docs/` keeps its own `package-lock.json`, and the
   existing `withastro/action` GitHub Pages + Cloudflare deploy stays valid
   unchanged. (This deletes v2 §8-A and most of §4.1.) Components are still
   authored cleanly enough to be *extractable* to a shared package later if a
   desktop app ever materializes — but that is out of scope now.
3. **Keep Starlight permanently — DROP old Phase 6.** Docs (Introduction, Get
   started, Guides) stay on Starlight forever; shadcn governs everything else.
   The Tailwind-↔-Starlight coexistence risk (v2 **T2**) is therefore a
   *permanent* constraint, not something a final phase ends — permanently
   mitigated by **Preflight OFF** + Tailwind utilities **layered below** the
   existing unlayered site CSS + shadcn scoped to island roots. Pagefind stays
   Starlight-provided (v2 **R-D** is moot).
4. **Proactive UX improvement, documented per PR.** "Same look and feel" is the
   floor, not a freeze. Where a control is mislocated, mis-grouped, or doesn't
   serve its function, it is redesigned during migration — each UX change
   called out in the PR body and screenshot-verified across ≥3 palettes ×
   light/dark × desktop/tablet/mobile.
5. **Overnight cadence: push through surfaces, one PR per surface, never merge
   unasked.** Open a PR per surface, drive CI green, auto-watch + rebase; stop
   and ask for merge authorization (HARD RULE 6–7). Export-path work triggers
   the "STOP and show me" sign-off.

**Corrected facts** (v2 miscounts, fixed): there are **14** base palettes
(indaco, cuoio, ardesia, atelier, brina, burgundy, carbone, carta, concrete,
crepuscolo, laguna, magnolia, mustard, onyx — `listBasePalettes()`), not 13;
carbone is dark-only (identical light/dark blocks). The website token set is
**18** properties (`--bg`, `--bg-alt`, `--bg-dark`, `--border`,
`--text-heading/-body/-muted`, `--accent`, `--accent-soft`, `--on-accent`, and
`--chart-cat1..8`), not 10 — so the bridge **maps the existing 8 per-palette
categorical hues onto shadcn `--chart-1..5`** instead of inventing a
palette-blind ramp.

**Foundation validated (Phase 0 spike, 2026-06-14):** the install matrix
resolves with **zero peer warnings** — Astro 6.3.7 (Vite 7.3.3) · `@astrojs/react`
5 · React 19.2 · `tailwindcss`/`@tailwindcss/vite` 4.3.1 · shadcn CLI 4.11. The
token bridge is a **one-way CSS shim** (`shadcn token → var(--lattice-token)`),
dark variant keyed to `[data-mode="dark"]` (not `.dark`), no second theme system.

**Revised phase order (supersedes §7):** 0 Foundation → 1 Shared chrome
(topbar: palette `Select` + mode toggle + nav + mobile drawer, killing the 5
duplicated copies) → 2 Components reference → 3 Landing → 4 Playground → 5
Workbench → 6 Drawing Board. No Starlight-removal phase; no desktop phase.

**Phase 0 landed (2026-06-14), maker-checker reviewed.** Foundation in
`docs/`: `@astrojs/react` + Tailwind v4 (`@tailwindcss/vite`, Preflight OFF) +
shadcn, the token bridge (`docs/src/styles/tailwind.css`), the contrast gate
(`tools/check-shadcn-bridge-contrast.js`, run by the unit suite — deliberately
NOT a root npm script, so it never bloats the engine bundle that inlines
`package.json`), and the invariant guard suite
(`test/unit/tokens/shadcn-bridge.test.js`). Verified
visually across indaco/cuoio/carbone/onyx (light+dark) and by a full
production build (67 pages, Pagefind intact).

**Load-bearing caveat for every later phase (checker P3):** Tailwind's
`theme`/`utilities` are imported into `@layer`, so they are *layered*; the
~7k lines of bespoke site CSS are deliberately *unlayered* to beat Starlight
(`lattice.css`). Unlayered CSS beats layered regardless of specificity — so a
shadcn island's Tailwind utility class will **silently lose** to any leftover
unlayered global rule (`a`, `button`, `.lx-*`, …) that still targets it. The
migration's "delete the migrated surface's bespoke CSS in the SAME PR" rule
(§4.3) is therefore now load-bearing for **correctness**, not just tidiness:
if a control's utilities "aren't applying," the old CSS for it wasn't deleted.
Add a per-surface integration check that the island's intended styles win.

**Phase 1 landed (2026-06-14), maker-checker reviewed.** One shared controller
(`docs/src/lib/site-chrome.ts`) + one accessible shadcn island
(`docs/src/components/site/PaletteControls.tsx`) replaced **six** hand-rolled
palette/mode controllers across landing, playground, the components reference,
the Starlight header (coexists with Pagefind), and the Workbench (mode-only).
Vitest + RTL harness wired as a CI gate. **The Drawing Board was deliberately
deferred to its own phase:** its top-bar palette picker writes the *deck's*
`theme:` front matter (authoring semantics), not just page chrome — folding it
into the uniform chrome island would be a real UX regression, so it keeps its
native control until §7 Phase 6 (decide there whether that picker stays
deck-theme-writing or becomes chrome-only).

**Phase 2 landed (2026-06-14), maker-checker reviewed.** The components
reference (index grid, left nav, per-component docs, breadcrumb, pager) → React
+ shadcn; `component-browser.js` replaced by a shared module-singleton
`useSyncExternalStore` driving both the grid and the nav from one query +
group-by (`docs/src/lib/component-browser-store.ts` + `component-search.ts`).
`components.css` retired 906 → ~330 lines (kept the Astro shell + `specimen-*`).
**The live Specimen (CodeMirror + deck-render iframe) stays vanilla** — the
wrap-don't-reinvent boundary; its variant/open-in-playground handoff attributes
are preserved exactly.

**Phase 3 in progress (2026-06-14): the Playground.** Wrap, don't reinvent —
the render loop calls the unchanged `window.LatticePlayground.render` +
`deck-preview.js renderDeck`; `editor.js` (CodeMirror), `deck-config.js`, and
the engine bundle are wrapped, not rewritten.

**Phase 6 — Drawing Board (2026-06-14): CORE delivered, chrome-by-increment.**
The Drawing Board is the largest/most-coupled surface (~1615-line `.astro` +
~3400-line CSS + ~25 vanilla modules orchestrated by one `is:inline` render
controller over the `window.__db*` bus). Per "a working partial beats a broken
whole", this increment migrates the highest-value, lowest-risk chrome while
keeping the proven vanilla orchestration intact (the wrap-don't-reinvent
boundary):
- **On-demand engine load** — the `lattice-playground.js` bundle no longer ships
  as an eager `<script defer src>`; it loads via `load-engine.ts ensureEngine()`
  on idle after the chrome paints (matching the Playground/Workbench perf phase).
  `engineUrl` added to the `db-data` payload.
- **Topbar palette/mode → React island** (`components/drawing-board/
  DrawingBoardTopbar.tsx`, `client:idle`). It REPLICATES the deck-theme-writing
  semantics (NOT the chrome-only site `PaletteControls`): a palette pick WRITES
  the deck's `theme:` front matter via the controller's new `window.__dbChrome`
  bus (`applyTheme` → `__dbConfig.writeFrontMatter`), and `syncThemeControls`
  mirrors the deck theme back onto `data-palette` and fires `db-chrome-sync` so
  the island reflects deck-theme changes + newly-saved library palettes. The
  pre-paint FOUC script + `data-tours` gating are untouched.
- **Export menu chrome → shadcn DropdownMenu** (`DrawingBoardExportMenu.tsx`).
  Sign-off-gated: the export LOGIC and OUTPUT are UNCHANGED — `drawing-board-
  export.js` is byte-identical; the island only drives the unchanged `runExport`
  via `window.__dbExport`. "Export chart" visibility uses the unchanged
  `activeChartSection` gate.
- **CSS retired** (only what migrated): the `.db-export-menu` / `.db-menu-item`
  blocks + the `#db-export::after` chevron rules in `drawing-board.css`.
- **Tests + gates:** radix jsdom polyfills added to `vitest.setup.ts`; 7 new
  island tests; a `drawing-board` case added to `check:overflow` (passes at
  390/820/1440 with drawer + pane + export-menu interactions). Verified live
  (puppeteer): editor types, on-demand engine renders the preview, the
  deck-theme picker writes front matter + re-themes, the export menu opens, a
  deck is created via the IndexedDB store, Coach/Converse tabs switch.

**Deferred (left vanilla-but-working, driven via the `__db*` bus):** the editor
host (CodeMirror), the preview filmstrip (`deck-preview.js`), the IndexedDB
store, the architect/coach/settings/chat modules, the decks/versions/settings/
deck-setup DRAWERS (vanilla `<aside>` + the IIFE open/close), the mobile pane
tabs, the resizers, the **Refine menu** (`createRefine` builds its menu DOM
dynamically and is model-gated — its DOM *is* its logic, so converting the
chrome would mean reimplementing it, which the boundary forbids), and the
practice/focus overlays + tours + OAuth. The shared `.palette-select` /
`.mode-toggle` CSS in `landing.css` is now dead site-wide but is left for the
Landing phase to retire (out of this surface's scope). The drawer→`Sheet`/
settings→`Sheet` chrome conversions (the `DeckSetupSheet` precedent) are a
defensible next increment if pursued as a follow-up.

**Operating learnings (this effort):**
- **Docs-site changes get NO `CHANGELOG.md` entry.** The changelog drives the
  published *engine* npm package; the docs site doesn't ship in it (HARD RULE
  10, pure-internal). Each phase's maker tends to add one — revert it.
- **The engine emulator bundle inlines the ROOT `package.json`.** Adding a root
  npm script makes `dist/lattice-emulator.js` stale → forces a `dist/` rebuild,
  which this effort forbids. Keep new website tooling out of root `scripts`
  (run gates via the unit suite). `docs/package.json` is separate — safe.
- **Keep the branch rebased onto `main`** (HARD RULE 16). Rebase can *silently*
  drop a line adjacent to a `main` edit (no conflict shown) — re-verify gates
  after every rebase.

---

> Status (historical, v2): **PLAN — checker-reviewed (v2), awaiting author
> approval.** No production code has moved. Each phase is a maker-checker gate;
> nothing merges until the checker passes the per-PR checklist in §5.

## 1. Why

We have been rolling our own website components — ~4,400 lines of bespoke
CSS, ~5,000 lines of vanilla-JS DOM apps, and hand-written Astro
components. That is good craftsmanship but it is not sustainable: the most
expensive, error-prone parts (focus management, keyboard nav, ARIA,
dialog/menu/tabs behavior) are re-implemented by hand on every surface.

Two things make a component framework worth the migration cost now:

1. **Our site is unusually app-like.** The Drawing Board and Playground
   are real apps (editors, chat, settings, dialogs) — shadcn's sweet spot,
   not a marketing-site over-reach.
2. **A second consumer amortizes the cost.** We are building a Tauri
   desktop app (Laticent) that already embeds the same engine. A Tauri
   shell is a React webview; if the website and the desktop app share one
   component library and one token system, we build the authoring UI
   **once for both**. That flips the ROI on the riskiest surface (the
   Drawing Board) from "website maintenance" to "desktop's core UI, built
   ahead of time."

**Honest framing (the contract for the whole effort):** shadcn + Tailwind
become the spine for the *website's UI scaffolding and app surfaces*,
retiring bespoke CSS and hand-rolled interactive widgets. **Lattice's own
component catalog (the 12 buckets) and the slide-engine visual contract
(`lattice.css` + the palette tokens in `themes/*.css`) are untouched.**
shadcn governs the *chrome and the authoring apps*; the Lattice catalog
governs the *slide components being showcased*. The token bridge (§4.2) is
the one seam where the two systems meet — it reads `themes/` and writes
shadcn tokens; it never edits `themes/`.

shadcn is **not** "less code" — its components are copied into our repo and
we own them. The win is *correct accessibility and a consistent vocabulary
we did not have to design*, plus a stack every AI tool already understands
(this is a heavily agent-driven repo).

## 2. End state

- One component spine — **React + Tailwind v4 + shadcn/ui** — across the
  whole website and, via a shared workspace package, the desktop app.
- **No Starlight.** It is kept only as disposable scaffolding through the
  early phases; the final phase replaces it with a shared React/shadcn MDX
  docs reader so the *one surface that cannot travel to desktop* stops
  being an exception. End state has a single token system and a single
  component model everywhere.
- **`packages/ui`** (React + shadcn, private workspace package) and
  **`packages/core`** (framework-agnostic pure logic) are consumed by
  `docs/` (website, first consumer) and `apps/desktop` (Tauri, second
  consumer).
- Selecting a palette in the topbar drives **shadcn components, the
  remaining bespoke CSS, and the rendered specimens** from the **single
  existing source of palette truth** (`themes/*.css`). All **13** palettes
  continue to work everywhere (12 are light/dark pairs; **carbone is
  dark-only** — its light and dark token blocks are identical, and the
  bridge must treat it as single-mode, not fabricate a light variant).
- The engine (`@laticent/lattice`) is unchanged in behavior, build,
  publish, and exports. It simply also becomes the workspace root.

## 3. Decisions locked (the forks we already resolved)

| Fork | Decision | Why |
|---|---|---|
| Runtime / "is Astro-islands janky?" | **React islands**, principled boundary | Islands are Astro's first-class model; jank comes from undisciplined use, which §4.3 forbids. React (not Preact/Svelte port) because **desktop shares the exact components.** |
| Repo topology | **Monorepo, npm workspaces** | User decision. Shared `packages/ui` + `packages/core` consumed by web + desktop. |
| Engine package | **Stays at root**, becomes workspace root | Avoids moving `dist/`, `themes/`, `lib/`, the npm `exports`, and every CI path filter. Lowest blast radius (§8). |
| Starlight | **Keep as scaffolding, replace in the final phase** | It is the only surface that *cannot* run in the React desktop app; a shared React docs reader serves both. Small content volume makes replacement cheap — but not Phase 1. |
| Drawing Board | **Strangler-fig**, engine port last, sub-phased | ~5k LOC vanilla JS. The lint/review/scorecard cores are genuinely pure; the store (raw IndexedDB) and editor (DOM-bound CodeMirror) are browser-coupled and get *wrapped*, not "reused unchanged" (§4.4). |
| Token strategy | **Bridge:** a generator *derives* shadcn tokens per palette/mode from the 10 palette tokens, with a contrast gate (§4.2) | Preserves the 13-palette product identity; one source of truth; never edits `themes/`. |

## 4. Architecture

### 4.1 Workspace layout (minimal-move)

```
lattice/
├── package.json          # @laticent/lattice (engine) + "workspaces": ["docs","packages/*","apps/*"]
├── lib/ themes/ tools/ dist/   # ENGINE — unchanged paths (publish + CI filters stay valid)
├── docs/                 # Astro site — stays at this path; becomes a workspace member
├── packages/
│   ├── ui/               # @laticent/ui  (private) — React + Tailwind + shadcn + the token bridge + the palette-blind structural tokens
│   └── core/             # @laticent/core (private) — framework-agnostic logic lifted from docs/src/playground
└── apps/
    └── desktop/          # Tauri + Vite + React (Phase 7 / handed to desktop kickoff) — consumes ui + core
```

Rules:
- Root **remains** the published `@laticent/lattice`. `packages/*` and
  `apps/*` are `"private": true`, never published. **Verify** in Phase 0
  that `npm publish` from the workspace root still tarballs only the
  engine `files` allowlist and does not try to resolve `packages/*`
  workspace deps into the tarball (§8-E).
- **Do not move** `dist/`, `themes/`, `lib/`, or the `docs/` path. The
  engine build orchestration, the `docs/` asset-sync scripts, the GitHub
  Pages trigger paths, and the CI `code`/`docs` path filters all stay
  valid (§8 lists what *would* break if we moved them — we don't).
- `packages/ui` component names are **prefixed/namespaced** (or simply
  distinct) so none shadow an engine layout name (`card`, `grid`, …); the
  ownership guard is not workspace-aware (§8-D).
- `packages/core` is created lazily, when the first pure module is lifted
  (Phase 5b), to avoid premature abstraction.

### 4.2 The token bridge (the linchpin — rewritten after checker B3/B4)

Single source of truth today: `themes/<name>.css` → `tools/build-docs-portal.js paletteCss()`
→ `tools/build-landing-tokens.js` → committed `docs/src/styles/lattice-tokens.generated.css`,
emitting **10** tokens per `html[data-palette][data-mode]` block (`--bg`,
`--bg-alt`, `--border`, `--text-heading`, `--text-body`, `--text-muted`,
`--accent`, `--accent-soft`, `--on-accent`, `--bg-dark`). Runtime: topbar
writes `data-palette`/`data-mode` on `<html>` + localStorage
(`lattice-docs-palette`/`lattice-docs-mode`), with a FOUC pre-paint script
and a `pageshow` re-sync.

We **extend the same generator** (it already imports `listBasePalettes()`
and has each resolved hex in hand) with a sibling step that emits shadcn's
semantic tokens. **This is NOT a 1:1 alias table** — the checker proved an
alias table breaks dark mode. It is a **per-mode derivation with a contrast
gate**:

**(a) Direct aliases** (semantically safe both modes):
`--background: var(--bg)`, `--foreground: var(--text-body)`,
`--card: var(--bg-alt)`, `--card-foreground: var(--text-body)`,
`--primary: var(--accent)`, `--primary-foreground: var(--on-accent)`,
`--muted: var(--bg-alt)`, `--muted-foreground: var(--text-muted)`,
`--border: var(--border)`, `--input: var(--border)`, `--ring: var(--accent)`.

**(b) Derived interactive surfaces** (the B3 fix). shadcn `--accent` /
`--accent-foreground` drive hover/active rows (Command, Select,
DropdownMenu, ghost buttons). Because `--accent-soft` collapses onto the
surface in dark palettes, the generator **computes** a guaranteed-distinct
hover surface rather than aliasing: `--accent` = a tint of `--bg-alt`
toward `--accent` (precomputed hex, or `color-mix(in oklab, var(--bg-alt),
var(--accent) 14%)`), with `--accent-foreground: var(--text-heading)`. The
**popover** is lifted off the card so stacked surfaces separate (m1):
`--popover` = `--bg` in dark, `--bg-alt` in light (or a computed one-step
lift), `--popover-foreground: var(--text-body)`.

**(c) State + sidebar + chart tokens the palette does not have** (the B4
fix, and the resolution of the "never touch `themes/`" contradiction).
The palettes define **no** `destructive`/`success`/`warning` and no
`--sidebar-*` / `--chart-1..5`. We do **not** add them to `themes/`.
Instead they live in `packages/ui` as **palette-blind structural tokens**
(same discipline as `--radius`/shadows), hand-picked and WCAG-checked:
  - `--destructive` / `--destructive-foreground`: a palette-blind red ramp
    (one light value, one dark value) — danger is hue-universal, it does
    not need to match each palette.
  - `--sidebar-*`: aliased to the surface tokens (`--sidebar: var(--card)`,
    `--sidebar-accent: var(--accent)` [the derived one], `--sidebar-border:
    var(--border)`, etc.).
  - `--chart-1..5`: a palette-blind categorical ramp; **deferred/low
    priority** — the engine renders charts, so the website rarely needs
    shadcn charts. Defined as a fallback so components that reference them
    never resolve to `unset`.

**(d) Contrast gate.** Because (b)/(c) are derived, the generator runs a
WCAG contrast + distinguishability check per palette/mode at build time
(foreground-on-surface pairs ≥ AA; hover-surface vs surface ΔL above a
floor) and **fails the build** if any pair regresses. This replaces the
false "reviewed once, generated forever" claim: the mapping has per-mode
logic and is *validated* forever, not reviewed once.

**(e) Headings inside surfaces (m2).** Because `--card-foreground` /
`--popover-foreground` map to body text, headings inside shadcn surfaces
must explicitly opt into `--text-heading` (a `packages/ui` typography
convention), or card titles render in body color.

Consequences:
- A palette change **automatically** restyles every shadcn component.
- The bridge is a **committed, freshness- and contrast-gated artifact**
  wired into `tools/build.js` with a `:check` gate + a lefthook glob, so it
  can never drift from `themes/`.
- The count is **derived** from `listBasePalettes()` (13 today), never
  hardcoded; carbone emits one mode.
- The rendered-deck iframes are unaffected: they load raw
  `themes/<name>.css` into an isolated `srcdoc` and must keep doing so.
  This only holds while the host keeps mirroring `data-palette` onto
  `<html>` — see T4 (the iframe reads it from the host).

### 4.3 The island boundary (what keeps it from being janky)

- **Astro owns** routing, page shells, layout, static content → ships zero
  JS where there is no interaction.
- **React + shadcn islands own** the interactive widgets → JS ships *only*
  where there is interaction. The previously-zero-JS landing stays close to
  zero-JS (only the palette/mode island hydrates).
- **One styling system.** Tailwind + the bridged tokens. Bespoke CSS for a
  surface is **deleted in the same PR** that migrates it — never left
  running in parallel "for now."
- **State transport, corrected for an MPA (checker M4).** These are
  **separate routes**, not an SPA — a fresh page load on every navigation.
  Therefore **localStorage is the cross-page source of truth**, exactly as
  today. nanostores (`@nanostores/persistent`) are **intra-page** glue
  between islands on one page and rehydrate from localStorage on mount.
  The **inline pre-paint FOUC script stays** (it sets `data-palette` before
  first paint); the React island must **rehydrate from localStorage on
  mount and must NOT replace** that pre-paint script, or palette flashes on
  every navigation (R-A).

### 4.4 Shared core (what survives the UI swap — claim corrected)

Recon split the logic into two honest categories:
- **Genuinely pure / framework- and DOM-agnostic** — the architect/coach
  engines built on `lib/authoring/lint-core|review-core|scorecard` and
  `lib/families.mjs`, plus the model ladder's routing logic. These move to
  `packages/core` and are reused **unchanged** by desktop.
- **Browser-API-coupled, wrapped (not "reused unchanged")** — the store is
  **raw IndexedDB** and the editor is **DOM-bound CodeMirror**
  (`window.__dbStore`, `window.__dbEditor`). These are portable *logic* but
  they touch browser APIs/DOM, so they get thin React wrappers with
  explicit **StrictMode guards** (single-init refs / cleanup) to avoid
  double-instantiation (R-B, R-C). The IndexedDB schema and the editor
  adapter interface are preserved.

## 5. The maker-checker operating model

Two levels, as requested.

**Level A — producing this plan.** Drafted by a *maker*, reviewed
adversarially by a *checker* (§10), revised, then to the author as the
final checker.

**Level B — executing each phase.** Every phase ships as **one surface per
PR** (sub-phased where noted). The **maker** implements + retires that
surface's bespoke CSS in the same PR + produces the evidence bundle. The
**checker** (separate agent pass or human four-eyes) blocks merge until
**every** item passes:

  1. **Visual parity** — `tools/rasterize-for-review.sh` across ≥3 palettes
     (indaco, cuoio, carbone) in light **and** dark; `tools/pixel-check.js
     diff` vs a pre-change snapshot. Stacked surfaces (popover-over-card)
     explicitly checked (m1). Every intentional diff justified.
  2. **Token parity + contrast** — shadcn tokens resolve for **all 13
     palettes** (carbone single-mode); the §4.2-(d) contrast gate is green;
     zero hardcoded hex in island/component CSS.
  3. **No orphaned CSS** — the migrated surface's bespoke CSS is *deleted*;
     `grep` shows no remaining references.
  4. **A11y** — keyboard nav, **visible hover/active fill** (not just focus
     ring — the B3 trap), correct ARIA/roles.
  5. **Bundle budget** — JS delta within the agreed cap; zero-JS pages stay
     zero-JS except named islands.
  6. **Engine untouched** — `npm run build:check`, `check:ownership`, unit
     suite, integration parity tier green; `lib/authoring` imports and the
     `window.LatticePlayground` global still load; **no PR under this
     effort touches `lib/`, `themes/`, or `dist/`** (T8).
  7. **Naming isolation** — no `packages/ui` export shadows an engine
     layout name.
  8. **Component tests** — the new React test harness (Vitest + RTL, stood
     up in Phase 0 — none exists today, R-E) covers the surface's logic;
     CI runs it.
  9. **Reversible** — clean single-revert; no phase depends on a
     half-finished earlier phase.

  CHANGELOG `## Unreleased` updated when a shipped surface changes. A
  failing gate is a root cause to fix, never a `--no-verify`.

## 6. Risk register (revised)

| # | Risk | Mitigation |
|---|---|---|
| T1 | **Tailwind preflight** (global reset) leaks into the deck `srcdoc` iframes / fights remaining bespoke CSS | Disable/scope preflight; keep deck CSS injection reading `data-palette` off the host (T4). The iframe is isolated but **not** auto-safe — `live-render.js` rebuilds `srcdoc` from the host attribute, so safety depends on T4 holding. |
| T2 | **Tailwind preflight vs Starlight's `--sl-*` reset** (corrected — Starlight does *not* bundle Tailwind) | Live risk for the **whole** Starlight-coexistence window (Phases 0–5), not something Phase 6 ends early. Scope Tailwind so its `@layer base` reset does not apply inside Starlight-rendered routes; verify per-PR on a guide page. |
| T3 | **Version-compat unverified** — Astro 6 ↔ Starlight 0.39 peer Astro range ↔ `@astrojs/react` ↔ React 19 ↔ Radix/shadcn peer deps ↔ `@tailwindcss/vite` vs Astro's bundled Vite | Phase 0 gate: the install matrix resolves with **zero peer warnings**; Astro/Starlight/react-integration pinned together *before* the spike. (M1.) |
| T4 | **DOM-id / attribute contract** — un-migrated pages read `#palette` by id and the iframes read `data-palette` off `<html>` | A shadcn `Select` is not a native `<select id="palette">`; replacing it naively returns `null` for every un-migrated page (M3). Phase 1 refactors **all** per-page palette/mode controllers into one shared controller + island **in the same PR**, and the controller keeps writing `data-*` + localStorage so iframes + un-migrated surfaces keep theming. |
| T5 | **Bundle creep** on the zero-JS landing | Island discipline (§4.3) + per-PR bundle budget (§5-5). |
| T6 | **Deploy is a rewrite, not a rewire** (M2) | See §8-A: abandon `withastro/action`, delete `docs/package-lock.json`, fix `ci.yml` `docs-build` (`working-directory`/`cache-dependency-path`), validate with a preview deploy in Phase 0. |
| T7 | **Generator drift / contrast regression** | Committed, `:check`- and contrast-gated artifact wired into `tools/build.js` + lefthook (§4.2-d). |
| T8 | **biome blind spot** — lints only `.{js,mjs,cjs,json}`; React unchecked | Phase 0: add `**/*.{ts,tsx}` to `biome.json` `includes`, enable a11y/React rules, **and** add `tsx` to the lefthook `pre-commit` glob (a second edit site, m3). |
| T9 | **Scope creep into the engine** | The §1 contract + §5-6 gate reject any PR touching `lib/`/`themes/`/`dist/`. |
| R-A | **Palette FOUC under SSR/hydration** | Keep the inline pre-paint script; the island rehydrates from localStorage on mount and is never the sole source (§4.3). |
| R-B | **CodeMirror double-init in React StrictMode** | Single-init `useRef` + cleanup; the editor wrapper owns one `EditorView` (§4.4). Phases 3, 5a. |
| R-C | **IndexedDB races in React StrictMode** | Guarded open + idempotent effects in the store wrapper (§4.4). Phase 5b. |
| R-D | **Pagefind is currently provided *by* Starlight** | Phase 6 must add Pagefind as a **direct** dep and wire its CLI into the docs build (`astro build && pagefind --site dist`) in CI **and** the new deploy job — removing Starlight removes the index step (§8-A). |
| R-E | **No React test harness exists** | Phase 0 stands up Vitest + React Testing Library; §5-8 makes component tests a merge gate. |
| R-F | **Tailwind v4 `@layer` ordering vs the engine cascade** (`engineering/cascade.md`: `@layer` is declared-but-inert due to `!important`) | Phase 0 establishes layer order for the docs document explicitly; verify Tailwind's `base/components/utilities` layers do not perturb the engine cascade, especially near the `srcdoc` boundary. |

## 7. Phased roadmap

Order = lowest-risk-highest-leverage first, riskiest (Drawing Board engine)
last, Starlight removal final. Each phase is independently revertible.

### Phase 0 — Foundation (no visual change; the spike)
Workspaces on the root package (`"workspaces": ["docs","packages/*"]`);
**delete `docs/package-lock.json`** (single root lockfile); create
`packages/ui` (React 19 + Tailwind v4 via `@tailwindcss/vite` + `npx shadcn
init`); add `@astrojs/react` + Tailwind to `docs/`; **T3 gate:** the pinned
Astro/Starlight/react/Tailwind/Radix matrix resolves with zero peer
warnings. biome `.tsx` scope + rules + **lefthook glob** (T8). **Rewrite**
the deploy (`docs.yml`) and `ci.yml` `docs-build` job per §8-A; validate
with a preview deploy. Add the **token-bridge generator** with the per-mode
derivation, the `:check` gate, the **contrast gate**, and a lefthook glob
(§4.2). Set Tailwind preflight scoping (T1/T2) and the `@layer` order (R-F).
Stand up the **Vitest + RTL** harness (R-E). **Exit / the spike:** ship one
trivial shadcn island (a `Button`) in a non-critical spot, themed through
the bridge, with the **dark-mode contrast gate proven green across all 13
palettes**, deployed to a preview — proving the *entire* pipeline before
any real surface moves.

### Phase 1 — Shared chrome: the palette/mode controller + TopBar island
Build brand + nav + **palette `Select`** + **mode toggle** as one shadcn
island. **Critical (M3/T4):** in the *same PR*, refactor every standalone
page's inline `getElementById('#palette')`/`#mode-toggle` controller into
one shared controller module that the island uses, so **no un-migrated page
is left calling a removed element**; keep the pre-paint FOUC script; the
controller keeps writing `data-*` + localStorage (validates iframes still
theme). This is the highest-leverage shared component and the one desktop
needs first. Retire the topbar bespoke CSS.

### Phase 2 — Components reference (easy; the cost-judging surface)
Port `component-browser` + `Specimen` + `ComponentDocs`/`ComponentNav` to
React/shadcn (`Card`, `Tabs`, `Command`, `Badge`). Keep `lib/families.mjs`
grouping and the `live-render` specimen factory. Retire `components.css`.
Good place to judge real per-surface cost before committing the rest.

### Phase 3 — Playground (easy)
React shell + shadcn (`Tabs`, `Popover`/`Command` template picker, `Dialog`
settings, `Select`, `Button`). Lift editor + `live-render` + template-picker
*logic* to `packages/core`; the editor wrapper carries the R-B StrictMode
guard. Retire `playground.css`.

### Phase 4 — Landing (low; mostly Tailwind)
Rebuild marketing sections with Tailwind + a few shadcn components. Stays
near-zero-JS (only the Phase-1 palette island hydrates). Retire
`landing.css`.

### Phase 5 — Drawing Board (medium; highest desktop value) — strangler-fig
Each sub-phase is its own PR:
- **5a** Render loop + editor host as React (R-B guard); iframe `srcdoc`
  stays vanilla.
- **5b** Store → React context/hook (IndexedDB schema unchanged, R-C
  guard). **Lift the pure engines (architect/coach/model routing) + the
  wrapped store/editor into `packages/core`** — the desktop-shared payload.
- **5c** Architect findings → shadcn `Card`s.
- **5d** Coach → shadcn chips/cards.
- **5e** Chat + edit-card diff → shadcn message thread.
- **5f** Chrome: panels, resizers, drawers → `Dialog`, mobile pane tabs →
  `Tabs`, export menu → `DropdownMenu`, model settings → `Dialog`/`Select`.
Retire `drawing-board.css`.

### Phase 6 — Replace Starlight (the no-Starlight end state)
Build the shared React/shadcn MDX docs reader in `packages/ui` (sidebar,
TOC). **Add Pagefind as a direct dep and wire its CLI into the docs build +
CI + the deploy job** (R-D) — it currently arrives *through* Starlight.
Migrate the guide pages; remove the Starlight dependency, its `--sl-*`
bridge CSS, and the SocialIcons override. One token system, one component
model everywhere; T2 risk ends here.

### Phase 7 — Desktop bootstrap (validates the thesis; may be a separate kickoff)
Stand up `apps/desktop` (Tauri + Vite + React) consuming `packages/ui` +
`packages/core`. The seam is *ready* the moment Phase 5b lands.

## 8. Appendix — must-not-break (from build/deploy/hook recon, expanded after checker M2)

- **A. Deploy is a rewrite (not a config tweak).** `docs.yml` uses
  `withastro/action@v3` with `path: docs`, which runs `npm ci && npm run
  build` **inside `docs/`** keyed to `docs/package-lock.json`. A hoisted
  workspace produces a single root lockfile, so: **(1)** delete
  `docs/package-lock.json`; **(2)** replace the `withastro/action` job with
  explicit steps — checkout → setup-node → root `npm ci` → build engine
  artifacts → `npm run build -w docs` → `upload-pages-artifact` →
  `deploy-pages`; **(3)** fix `ci.yml` `docs-build` job, which today sets
  `working-directory: docs` + `npm ci` and `cache-dependency-path:
  docs/package-lock.json` — both break the same way; **(4)** Phase 6 adds
  `pagefind --site dist` to this job (R-D). Validate with a preview deploy.
- **B. Docs asset sync** `sync:portal`/`sync:playground` copy from `dist/`
  + `themes/`; `build-playground.js` writes **directly** to
  `docs/public/playground/`. Keep those paths; don't move `docs/`.
- **C. biome** lints only `.{js,mjs,cjs,json}` today; add `.{ts,tsx}` +
  React/a11y rules **and** add `tsx` to the lefthook `pre-commit` glob (two
  edit sites, T8/m3).
- **D. Ownership guard** (`tools/check-ownership.js`) is not
  workspace-aware → keep `packages/ui` names distinct from engine layouts.
- **E. CI path filters / release / `files` allowlist** — keeping engine +
  `docs/` in place means **no filter churn**; only *add* `packages/**`.
  Verify `npm publish` still tarballs only the engine allowlist and does
  not pull `packages/*` workspace deps into the package (M4/m4).
- **F. Pre-push is sequential** (`build:check` + integration share `dist/`)
  → don't parallelize; keep `dist/` at root.
- **G. session-start hook** installs at root → a hoisted workspace is
  *covered* by the existing root `npm install`; but verify the hoisted
  React/Tailwind tree resolves cleanly next to puppeteer/esbuild (no peer
  conflicts) after conversion. The hook's `poppler-utils`/`CHROME_PATH`
  guarantees are for the integration tier and are unaffected.

## 9. Open decisions for the author (checker-of-last-resort)

1. **`packages/core` now or lazily at 5b?** Plan defaults to lazy. Override
   to stand it up in Phase 0 if desired.
2. **Phase 7 (desktop) in this effort or a separate kickoff?** Plan treats
   the shared layer as the deliverable, desktop as a follow-on once 5b
   lands. Confirm.
3. **Bundle budget caps** per surface — propose numbers in Phase 0, ratify.
4. **Palette-blind `--destructive` and `--chart-1..5` values** (§4.2-c) —
   I'll propose a WCAG-checked ramp in Phase 0; ratify then. Confirm you're
   OK that danger/chart colors are *palette-blind* (not per-palette), since
   `themes/` is off-limits.
5. **Carbone single-mode policy** — bridge emits one mode for carbone;
   confirm the mode toggle should be hidden/disabled on carbone rather than
   toggling between two identical states.
6. **Starlight timing** — confirmed *last*; say so if you'd rather pull it
   earlier.

## 10. Changelog of this plan
- 2026-06-09 — Maker draft (after three grounded recon passes:
  build/deploy/hooks, Drawing Board architecture, token pipeline).
- 2026-06-09 — **Checker pass (adversarial).** Found 4 blockers (false
  "Starlight uses Tailwind" premise; 14-vs-13 palette miscount + carbone
  single-mode; dark-mode token collapse `--accent`→`--accent-soft`; missing
  `destructive`/`sidebar`/`chart` tokens colliding with the "never touch
  `themes/`" rule), plus the MPA-nanostores error, the TopBar id-contract
  forward dependency, the deploy-is-a-rewrite scope, and 6 missing risks
  (FOUC, CodeMirror/IndexedDB StrictMode, Pagefind build step, no React
  test harness, Tailwind layer ordering, version-compat).
- 2026-06-09 — **Maker v2** incorporates all of the above: §2/§4.2 palette
  count + carbone; §4.2 rewritten as a per-mode derivation with a contrast
  gate and palette-blind state/sidebar/chart tokens (resolving the
  `themes/` contradiction); §4.3 localStorage-as-cross-page-truth; §4.4
  store/editor "wrapped, not unchanged"; §5 adds a component-test gate +
  hover-fill a11y check; §6 replaces T2 and adds T3/R-A..R-F; §7 Phase 0
  gains the peer-dep + contrast gates and the test harness, Phase 1 fixes
  the id-contract, Phase 6 wires Pagefind; §8-A reframed as a deploy
  rewrite; §9 adds the palette-blind-color + carbone decisions.
- _pending_ — Author approval.
