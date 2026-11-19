---
status: proposed
summary: >
  dist/lattice.css (3.1 MB, 48.6k lines) and dist/lattice-runtime.js (~12.8 MB) are hard to read because 58% of the CSS
  is copied source prose and 77% of the runtime is an inline source map, not because they are concatenated. Single-file
  delivery stays: Marp needs one ordered theme and the cascade is source order. A 586-deck usage audit finds almost no
  dead CSS (6 orphan rules); the weight is variants x slide shapes, long selectors (50% of the bytes) and 37 hand-built
  card surfaces that have drifted (9 paddings, 9 radius forms). Plan: make the files legible (no behaviour change), make
  the usage audit trustworthy and delete what it proves dead, consolidate cards the way card-tag was, spike nesting
  lowered by esbuild, finish the loader followups that already exist, and let plugin styles load when used on the
  surfaces that load on demand (the full bundle keeps every plugin).
---

# Bundle legibility and slimming: validated findings and plan (2026-11-19)

> **PROVISIONAL — do not cite these numbers.** They were taken in a chat sandbox where `npm ci` could not run
> (the npm registry was unreachable), with missing packages stubbed. That breaks the rule at the top of CLAUDE.md
> ("we develop Lattice, we never consume it"). They are kept only to show where to look; Phase 0 re-takes every one on
> the real build, and this note is updated from that run before any item below is acted on.

## 1. Assumptions, checked

| # | Assumption made in discussion | Verdict | Evidence |
|---|---|---|---|
| 1 | Marp needs one registered theme; `@import url()` would bypass Marp's selector rewrite | **Holds** | `lib/engine/css.js`: palettes pull the base with the named `@import 'lattice'` (inlined); `@import url()` is hoisted untouched. Export-to-Marp ships the full minified CSS and runtime (`lib/export/marp-bundle.js`). Splitting into named themes would work but saves Marp nothing. |
| 2 | `lattice.css` is mostly comments; the runtime is mostly its source map | **Holds** | CSS: 1.77 MB of 3.06 MB is comments (3,686 comments); comment-free pretty 1.30 MB / 34.7k lines; minified 1.17 MB. Runtime: 12.8 MB with the inline map vs 2.9 MB without (my build, `roughjs`/`qrcode` stubbed). |
| 3 | Removing them is low risk | **Holds** | The only reader of a comment in `dist/lattice.css` is `tools/check-ownership.js` (`LATTICE-LAYERS-INERT`). The Marp kit already strips the runtime's inline map (`tools/build-marp-kit.js`, test `marp-kit-sample-deck.test.js`: "most of its weight, and no use to a reader"). CLI exports drop the runtime script entirely (`lattice.js` `RUNTIME_SCRIPT`). |
| 4 | The Studio already fetches styles as you edit | **Wrong** | The loader is Playground-only and opt-in (`?styles=modules`, `docs/src/lib/playground-engine.ts`). The Studio and landing page register the whole sheet. Adoption and the default are open followups `2794-p2` and `2794-p3`, with prerequisites (floor file, newcomer bake, real-iPhone check `2780-p7`). |
| 5 | Finished exports still need a per-deck CSS subset (E5) | **Mostly wrong** | The HTML player already prunes unused selectors and fonts per deck in both hosts (`lib/export/player-prune.js`). PDF, PNG and PPTX are rasters or native shapes, so CSS size does not reach the output. Little E5 work is left. |
| 6 | Map basemaps should load per chart | **Dropped** | Both basemaps are inlined on purpose (the "zero-fetch" asset boundary, `map.transform.js`). The docs preview runtime already drops every chart kernel. Only the full/min runtimes carry them, and those serve offline surfaces (VS Code preview, Marp bundle) where inlining is the point. |
| 7 | Dead-CSS tiers from the audit | **Holds, with two blind spots** | 0 of 586 rendered decks contained KaTeX or Mermaid output (KaTeX's wall needs `@jitl/quickjs`, stubbed here; Mermaid's library was not loaded), so those 499 rules are unmeasured, not dead. Slide-shape coverage is thin: `tall` 50 decks, `square` 9, `strip` 2. The 6 orphan rules were confirmed by grep. |
| 8 | The Marp bridge can flatten nested CSS | **Wrong as stated, true by another route** | The bridge note proves flattening `@layer` (277 decks), not nesting. esbuild 0.28, already the bundler, lowers nesting for `target: chrome91` (tested). Risk: a nested rule under a selector LIST lowers to `:is()`, which can change specificity, so it needs the computed-style gate. |
| 9 | `knip` and `jscpd` are not run | **Holds** | Both are devDependencies; no script, hook or workflow invokes them. |
| 10 | `lib/authoring/fact-check-core.js` is dead | **Product call, not cleanup** | It is the core of `2026-06-16-deck-fact-checking.md` (status `proposed`); only tests import it. |
| 11 | Card surfaces have drifted | **Holds** | 37 stylesheets paint a card. Tokens are shared (`--bg-alt` in 34, `--elevation-card` in 23) but padding has 9 values and radius 9 forms. |
| 12 | Plugins own their CSS | **Half true** | Each plugin declares `"styles": true` in its manifest and keeps `<plugin>.styles.css` in its folder (14 plugins, list generated into `lib/plugins/styles.generated.js`). But `tools/build-css.js` bundles every plugin sheet into `lattice.css` unconditionally: about 460 KB of 1.17 MB minified, with the chart kinds. A plugin's other assets already load when used (Mermaid payload `when: used`, icon data, plugin data); its styles do not. |

## 2. What the CSS is made of

Rule text by usage across 586 decks (examples, exemplars, test decks, 95 component galleries), each rendered by the
engine and run through the runtime in Chrome, every rule tested with `querySelector` (dynamic pseudo-classes and
pseudo-elements stripped). Mermaid and KaTeX are excluded (row 7).

| Tier | Rule text | Meaning | Action |
|---|---|---|---|
| Matched by some deck | 767 KB (69%) | live | keep |
| Combination never matched | 234 KB (21%) | every class appears, never together; mostly `square`/`strip` shapes and `marks-*` variants (half of table-reflow's 153 rules) | add coverage, then decide |
| Class only code sets | 110 KB (10%) | auto-split, export-time (`lattice-exporting`), chart branches (`fc-shape`, `state-node-shape`, `slope-dot-via`) | trace each producer |
| Orphan | ~1 KB, 6 rules | no deck, no code (`graph-callout-marker`, `inv-rows`, `split-cover-table`) | delete |

Shape of the bytes: selectors are 50% of the comment-free CSS. Repeated boilerplate in the minified file: the `figure`
dual-surface arm 55 KB, `:where([data-family=…])` 30 KB, the table-reflow guard 26 KB, `:not(lat-pane)` 7 KB.
Leading-`:is()` distribution adds only 2.5%.

## 3. Plan

One PR per phase, one commit per item (`workflow.md` §Batch a session's slices). Every item lists its gate; "computed-style
gate" means the whole-sheet vs changed-sheet comparison of every element's computed style plus `::before`/`::after` in
screen, print and dark, as `tools/style-loader-gate.mjs` and `tools/style-needs-audit.mjs` already do.

### Phase 0 — Measure with the real build (no behaviour change)

| Item | Change | Files | Done when |
|---|---|---|---|
| 0.1 | `npm run bundle:report`: per-module table for the CSS (id, source, raw, minified, comment share, from `cssModules` manifest) and per-module table for the runtime (esbuild `metafile`); written to `dist/bundle-report.md` | `tools/bundle-report.mjs`, `package.json` | the report reproduces §2's totals within 5% on a real `npm ci` build |
| 0.2 | Rule-level usage audit: extend `tools/style-needs-audit.mjs` from "module needed" to "rule ever matched", with KaTeX, Mermaid and the CLI auto-split running | `tools/style-needs-audit.mjs` | KaTeX and Mermaid rules report real hit counts; the four tiers of §2 are re-derived |

### Phase 1 — Legible full bundles (output paths unchanged)

| Item | Change | Files | Gate | Done when |
|---|---|---|---|---|
| 1.1 | Strip prose comments from `dist/lattice.css` and `dist/styles/`; keep the banner, the `@theme`/`@size` comment, the `/* === source === */` markers and the `LATTICE-LAYERS-INERT` note. Apply per piece so the module join contract holds | `tools/build-css.js` (`finish`), reuse `lib/core/css-comments.mjs` | `css:check`, `css-modules.test.js`, `build-css.test.js`, HARD RULE #26 gate, `check:render` | `lattice.css` about 1.35 MB; `lattice-min.css` byte-identical |
| 1.2 | Runtime source map to a sidecar: `sourcemap: 'linked'` → `dist/lattice-runtime.js.map`, shipped in `files` | `tools/build-runtime.js`, `package.json` | `runtime:check`, marp-kit and hydrate-script tests | `lattice-runtime.js` about 2.9 MB; DevTools resolves sources from the VS Code preview |
| 1.3 | Docs: `design/design-system.md` §10 and `tools/build-dist-readme.js` describe the readable twins and the report | as named | rule 6 | changelog fragment in `changelog.d/` |

### Phase 2 — Remove what is proven dead

| Item | Change | Gate | Done when |
|---|---|---|---|
| 2.1 | Delete the 6 orphan rules and the test fixtures that only keep them alive | computed-style gate on all decks | 0 differing elements |
| 2.2 | Coverage decks: `square` and `strip` variants for the components with the most never-matched combinations (table-reflow, chart-family text roles, team-profile, inventory, image) | `check:render` | Phase 0.2 re-run moves their rules out of "combination never matched" or confirms them dead |
| 2.3 | Chart-branch review: for each class in the "only code sets" tier that is not auto-split or export-time, trace the producer in the kind's layout file; add an example deck, or delete the CSS and the branch together | unit tests of the kind, computed-style gate | each class has an example or is gone, listed in this note |
| 2.4 | Delete the rules that 2.2 and 2.3 prove dead | computed-style gate | measured bytes saved recorded here |

### Phase 3 — One card surface

Precedent: `2026-09-27-card-tag-register.md` (one tag recipe, drift removed) and `base.card-reflow.css` (one width contract).

| Item | Change | Gate | Done when |
|---|---|---|---|
| 3.1 | Decision note for the card contract: a marker the transformers set on a card element, `base.card.css` with a zero-specificity `:where()` surface recipe bundled before components, tokens `--card-fill`, `--card-radius`, `--card-pad`, `--card-lift`; components keep their own slots and semantics | adversarial trio (HARD RULE #25) | owner approves the contract |
| 3.2 | Wave 1: migrate the components whose card already equals the majority (`--bg-alt`, `--radius-md`, `--elevation-card`) | computed-style gate, light/dark/print, all palettes | 0 differing elements |
| 3.3 | Wave 2: the drifted components; each drift becomes a token override (no visual change) or is normalized (visual change, owner sign-off with renders attached) | computed-style gate + owner sign-off | every card surface comes from `base.card.css` |

### Phase 4 — Selector boilerplate (spike, then decide)

| Item | Change | Gate | Done when |
|---|---|---|---|
| 4.1 | Rewrite `base.table-reflow.css` with native nesting; build lowers it with esbuild `target: chrome91` so every shipped file stays flat | computed-style gate on all decks; marp-cli and VS Code preview renders of the reflow examples | measured source-size and readability delta, and any specificity change found, written here |
| 4.2 | If 4.1 holds: same for the chart-family generated sheet and the `figure` dual-surface arms | as 4.1 | owner decision |

### Phase 5 — Style loader (existing followups, not new work)

`2794-p3` (Playground default) then `2794-p2` (Studio and landing). Their prerequisites stand: the floor as one static
file, the newcomer bake carrying the floor, heavy decks cheaper than floor-then-whole, and the real-iPhone check `2780-p7`.

### Phase 6 — Plugin styles load when used

The plugin is the seam: it already owns its stylesheet and already loads its other assets on use. Bring its styles under
the same rule on the surfaces that can load on demand, and leave the full bundle whole.

| Item | Change | Files | Gate | Done when |
|---|---|---|---|---|
| 6.1 | Contract: `contributes.styles` accepts `{ "when": "always" \| "used" }` (`true` keeps meaning `always`); a plugin is "used" by the same test its payload uses. Amend the plugin-system note | `lib/plugins/plugin.schema.json`, `tools/build-plugin-registry.js`, `2026-09-27-plugin-system.md` | schema tests, adversarial trio (contract change) | owner approves (D6) |
| 6.2 | Registry emits each plugin's style modules and `when`; the module manifest carries the plugin name per module | `lib/plugins/styles.generated.js`, `tools/css-modules.js` | `css:check`, `css-modules.test.js` | `dist/styles/manifest.json` names the owning plugin of every plugin module |
| 6.3 | Loader and floor: `when: used` plugin modules leave the start-up floor and load when the plugin is detected (source `detect` as the hint, the HTML scan as the authority) | `docs/src/lib/style-loader.ts`, `tools/style-needs-common.json` | `tools/style-loader-gate.mjs` on all decks, Chromium and WebKit | 0 differing elements; floor bytes for a no-plugin deck measured before and after |
| 6.4 | Bundle report groups bytes by owning plugin | `tools/bundle-report.mjs` | — | report shows per-plugin CSS and runtime bytes |
| 6.5 | Unchanged by design: `dist/lattice.css`, `lattice-min.css`, Export-to-Marp and the VS Code stylesheet keep every plugin (a recipient may add a slide that uses one). A plugin turned off in export settings is already trimmed from the HTML player by `player-prune.js` | — | `css:check` byte-identical | stated in the note's §5 |

Order: after Phase 0 (the report proves the bytes) and alongside `2794-p3`, since the floor it changes is the one that
followup ships.

## 4. Owner decisions (one round)

| # | Decision | Recommendation | Default if silent |
|---|---|---|---|
| D1 | Run `knip` and `jscpd` in CI (adds a job: CI contract) | Yes, report-only first | not added |
| D2 | `fact-check-core.js`: keep for the proposed feature or delete | Delete; it is in git history if the feature returns | keep |
| D3 | Size budget on `lattice-min.css`, `lattice-runtime-min.js` and a typical deck's loader bytes (CI contract) | Yes, from the Phase 0 report, warn-only for a month | not added |
| D4 | Go on the Phase 4 spike | Yes, it is one file and fully gated | no spike |
| D5 | Card normalization in Phase 3.3 (visual change) | Normalize to the majority; keep overrides only where a component's design needs them | token overrides, no visual change |
| D6 | Plugin contract gains `styles: { when: "used" }` (Phase 6.1, a canonical contract) | Yes; start with chart-family, mermaid, math and function-plot, the heaviest | contract unchanged, Phase 6 parked |

## 5. Not doing

- Splitting the shipped files for Marp: Marp inlines named imports, so it saves nothing and adds configuration.
- Subsetting Export-to-Marp: the recipient keeps editing and must have every component.
- Loading map basemaps on demand: inlining them is the offline contract (row 6).
