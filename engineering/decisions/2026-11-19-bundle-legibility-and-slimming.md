---
status: proposed
summary: >
  dist/lattice.css (3.1 MB, 48.6k lines) and dist/lattice-runtime.js (~12.8 MB) are hard to read because 58% of the CSS
  is copied source prose and 76% of the runtime is an inline source map, not because they are concatenated. Single-file
  delivery stays: Marp needs one ordered theme and the cascade is source order. A 586-deck usage audit finds almost no
  dead CSS (and the 6 "orphan" rules it named are live: code builds their class names); the weight is variants x slide shapes, long selectors (50% of the bytes) and 37 hand-built
  card surfaces that have drifted (9 paddings, 9 radius forms). Plan: make the files legible (no behavior change), make
  the usage audit trustworthy and delete what it proves dead, consolidate cards the way card-tag was, spike nesting
  lowered by esbuild, finish the loader followups that already exist, and let plugin styles load when used on the
  surfaces that load on demand (the full bundle keeps every plugin).
---

# Bundle legibility and slimming: validated findings and plan (2026-11-19)

> **PROVISIONAL — do not cite these numbers.** They were taken in a chat sandbox where `npm ci` could not run
> (the npm registry was unreachable), with missing packages stubbed. That breaks the rule at the top of CLAUDE.md
> ("we develop Lattice, we never consume it"). They are kept only to show where to look; Phase 0 re-takes every one on
> the real build, and this note is updated from that run before any item below is acted on.
> **Exception:** the file sizes in §1 row 2 and the counts the 2026-11-19 fact-check confirmed (comments, KaTeX and
> Mermaid rule counts, `:where([data-family])` and `:not(lat-pane)` bytes, table-reflow rule count, plugin share of the
> min bundle) were re-taken on a real `npm ci` build. Everything in §2 and §1 row 11 stays provisional.

## 1. Assumptions, checked

| # | Assumption made in discussion | Verdict | Evidence |
|---|---|---|---|
| 1 | Marp needs one registered theme; `@import url()` would bypass Marp's selector rewrite | **Holds** | `lib/engine/css.js`: palettes pull the base with the named `@import 'lattice'` (inlined); `@import url()` is hoisted untouched. Export-to-Marp ships the full minified CSS and runtime (`lib/export/marp-bundle.js`). Splitting into named themes would work but saves Marp nothing. |
| 2 | `lattice.css` is mostly comments; the runtime is mostly its source map | **Holds** | Re-measured on a real build of this branch (2026-11-19). CSS: 1.83 MB of 3.12 MB is comments (3,686 comments, 58.5%); comment-free 1.29 MB; minified 1.17 MB. Runtime: 12.8 MB with the inline map (76% of it) vs 3.05 MB without. |
| 3 | Removing them is low risk | **Holds** | Three kinds of comment are read, and Phase 1.1 keeps all three: the `@theme`/`@size` block (`lib/engine/css.js` parses `@size` from it), the `/* === source === */` markers (`test/unit/cli/build-css.test.js`), and the `LATTICE-LAYERS-INERT` sentinel (`tools/check-ownership.js` checks it in `tools/build-css.js` source, not in `dist/`). Nothing reads the prose comments. The Marp kit already strips the runtime's inline map (`tools/build-marp-kit.js`, test `marp-kit-sample-deck.test.js`: "most of its weight, and no use to a reader"). CLI exports drop the runtime script entirely (`lattice.js` `RUNTIME_SCRIPT`), except the opt-in `--fluid` viewer, which inlines it again. |
| 4 | The Studio already fetches styles as you edit | **Wrong** | The loader is Playground-only and opt-in (`?styles=modules`, `docs/src/lib/playground-engine.ts`). The Studio and landing page register the whole sheet. Adoption and the default are open followups `2794-p2` and `2794-p3`, with prerequisites (floor file, newcomer bake, real-iPhone check `2780-p7`). |
| 5 | Finished exports still need a per-deck CSS subset (E5) | **Mostly wrong** | The HTML player already prunes unused selectors and fonts per deck in both hosts (`lib/export/player-prune.js`). PDF, PNG and PPTX are rasters or native shapes, so CSS size does not reach the output. Little E5 work is left. |
| 6 | Map basemaps should load per chart | **Dropped** | Both basemaps are inlined on purpose (the "zero-fetch" asset boundary, `map.transform.js`). The docs preview runtime already drops every chart kernel. Only the full/min runtimes carry them, and those serve offline surfaces (VS Code preview, Marp bundle) where inlining is the point. |
| 7 | Dead-CSS tiers from the audit | **Partly: two blind spots, and the orphan tier is wrong** | 0 of 586 rendered decks contained KaTeX or Mermaid output (KaTeX's wall needs `@jitl/quickjs`, stubbed here; Mermaid's library was not loaded), so those 499 rules are unmeasured, not dead. Slide-shape coverage is thin: `tall` 50 decks, `square` 9, `strip` 2. The "6 orphan rules" are **refuted**: a grep of decks cannot see class names that code builds from templates. `graph-callout-marker` / `-detail` come from `noteItem()` in `lib/plugins/chart-family/shared/callout-place.js` (flowchart and state-chart phone-page notes), `split-cover-table` from `lib/core/split-envelope.js` (`split-cover-${layoutName}`), and `inv-rows` appears only inside `:not(.inv-rows)` in live rules. |
| 8 | The Marp bridge can flatten nested CSS | **Wrong as stated, true by another route** | The bridge note proves flattening `@layer` (277 decks), not nesting. esbuild 0.28, already the bundler, lowers nesting for `target: chrome91` (tested). Risk: a nested rule under a selector LIST lowers to `:is()`, which can change specificity, so it needs the computed-style gate. |
| 9 | `knip` and `jscpd` are not run | **Refuted** | `npm run quality` / `quality:check` (`tools/quality-assessment.js`) runs both, on demand. No CI workflow or lefthook hook runs them. |
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
| Orphan | ~1 KB, 6 rules (provisional) | the named examples are **not** orphans: `graph-callout-*` and `split-cover-table` are code-set, `inv-rows` lives only in `:not()` (see §1 row 7) | re-derive in Phase 0.2; delete only what it proves |

Shape of the bytes: selectors are 50% of the comment-free CSS. Repeated boilerplate in the minified file: the `figure`
dual-surface arm 55 KB, `:where([data-family=…])` 30 KB, the table-reflow guard 26 KB, `:not(lat-pane)` 7 KB.
Leading-`:is()` distribution adds only 2.5%.

## 3. Plan

One PR per phase, one commit per item (`workflow.md` §Batch a session's slices). Every item lists its gate; "computed-style
gate" means the whole-sheet vs changed-sheet comparison of every element's computed style plus `::before`/`::after` in
screen, print and dark, as `tools/style-loader-gate.mjs` and `tools/style-needs-audit.mjs` already do.

### Phase 0 — Measure with the real build (no behavior change)

| Item | Change | Files | Done when |
|---|---|---|---|
| 0.1 | `npm run bundle:report`: per-module table for the CSS (id, source, raw, minified, comment share, from `cssModules` manifest) and per-module table for the runtime (esbuild `metafile`); printed to stdout or written under `.scratch/`, never into `dist/` (G1) | `tools/bundle-report.mjs`, `package.json` | the report reproduces §2's totals within 5% on a real `npm ci` build |
| 0.2 | Rule-level usage audit: extend `tools/style-needs-audit.mjs` from "module needed" to "rule ever matched", with KaTeX, Mermaid and the CLI auto-split running | `tools/style-needs-audit.mjs` | KaTeX and Mermaid rules report real hit counts; the four tiers of §2 are re-derived; no rule is an orphan while `lib/` builds its class name from a template |

### Phase 1 — Legible full bundles (output paths unchanged)

| Item | Change | Files | Gate | Done when |
|---|---|---|---|---|
| 1.1 | Strip prose comments from `dist/lattice.css` and `dist/styles/`; keep the banner, the `@theme`/`@size` comment, the `/* === source === */` markers and the `LATTICE-LAYERS-INERT` note. Apply per piece so the module join contract holds. Optional: it trades the reading copy's rationale for bytes no shipped surface fetches (G2) | `tools/build-css.js` (`finish`), reuse `lib/core/css-comments.mjs` | `css:check`, `css-modules.test.js`, `build-css.test.js`, `style-needs-common.test.js`, HARD RULE #26 gate, `check:render` | `lattice.css` about 1.3 MB; `lattice-min.css` changes only as G2 states |
| 1.2 | Runtime source map to a sidecar: `sourcemap: 'linked'` → `dist/lattice-runtime.js.map`, already shipped, since `files` includes `dist/` | `tools/build-runtime.js` | `runtime:check`, the marp-kit test and the hydrate tests (`test/unit/plugins/hydrate-host.test.js`, `fence-hydrate-resolve.test.js`) and G3 | `lattice-runtime.js` about 3.05 MB; DevTools resolves sources from the VS Code preview |
| 1.3 | Docs: `design/design-system.md` §10 and `tools/build-dist-readme.js` describe the readable twins and the report | as named | rule 6 | changelog fragment in `changelog.d/` |

### Phase 2 — Remove what is proven dead

| Item | Change | Gate | Done when |
|---|---|---|---|
| 2.1 | Delete the rules Phase 0.2 proves dead (none of the provisional 6 qualifies) and the test fixtures that only keep them alive | G4, then the computed-style gate on all decks | G4's census is clean for every rule; 0 differing elements |
| 2.2 | Coverage decks: `square` and `strip` variants for the components with the most never-matched combinations (table-reflow, chart-family text roles, team-profile, inventory, image) | `check:render` | Phase 0.2 re-run moves their rules out of "combination never matched" or confirms them dead |
| 2.3 | Chart-branch review: for each class in the "only code sets" tier that is not auto-split or export-time, trace the producer in the kind's layout file; add an example deck, or delete the CSS and the branch together | unit tests of the kind, computed-style gate | each class has an example or is gone, listed in this note |
| 2.4 | Delete the rules that 2.2 and 2.3 prove dead | G4, then the computed-style gate | measured bytes saved recorded here |

### Phase 3 — One card surface

Precedent: `2026-09-27-card-tag-register.md` (one tag recipe, drift removed) and `base.card-reflow.css` (one width contract).

| Item | Change | Gate | Done when |
|---|---|---|---|
| 3.1 | Decision note for the card contract: a marker the transformers set on a card element, `base.card.css` with a zero-specificity `:where()` surface recipe bundled before components, tokens `--card-fill`, `--card-radius`, `--card-pad`, `--card-lift`; components keep their own slots and semantics; G5 holds | adversarial trio (HARD RULE #25) | owner approves the contract |
| 3.2 | Wave 1: migrate the components whose card already equals the majority (`--bg-alt`, `--radius-md`, `--elevation-card`) | computed-style gate, light/dark/print, all palettes | 0 differing elements |
| 3.3 | Wave 2: the drifted components; each component's current look becomes its own token values on the shared contract (D5: no normalization, no visual change) | computed-style gate | every card surface comes from `base.card.css`, and a new look needs only new token values |

### Phase 4 — Selector boilerplate (spike, then decide)

| Item | Change | Gate | Done when |
|---|---|---|---|
| 4.1 | Rewrite `base.table-reflow.css` with native nesting; build lowers nesting only (G6) so every shipped file stays flat | computed-style gate on all decks; marp-cli and VS Code preview renders of the reflow examples | measured source-size and readability delta, and any specificity change found, written here |
| 4.2 | If 4.1 holds: same for the chart-family generated sheet and the `figure` dual-surface arms | as 4.1 | owner decision |

### Phase 5 — Style loader (existing followups, not new work)

`2794-p3` (Playground default) then `2794-p2` (Studio and landing). Their prerequisites stand: the floor as one static
file, the newcomer bake carrying the floor, heavy decks cheaper than floor-then-whole, and the real-iPhone check `2780-p7`.

### Phase 6 — Plugin styles load when used

The plugin is the seam: it already owns its stylesheet and already loads its other assets on use. Bring its styles under
the same rule on the surfaces that can load on demand, and leave the full bundle whole.

| Item | Change | Files | Gate | Done when |
|---|---|---|---|---|
| 6.0 | Before D6: for each plugin module in `tools/style-needs-common.json`, list the rules that match decks which do not use the plugin. If the needs index already defers the module, ship Phase 6 as a floor-data change and drop 6.1 and 6.2 (G7) | `tools/style-needs-common.json` | `style-needs-common.test.js` | the list is written here |
| 6.1 | Contract: `contributes.styles` accepts `{ "when": "always" \| "used" }` (`true` keeps meaning `always`); a plugin is "used" by the same test its payload uses. Amend the plugin-system note | `lib/plugins/plugin.schema.json`, `tools/build-plugin-registry.js`, `2026-09-27-plugin-system.md` | schema tests, adversarial trio (contract change) | owner approves (D6) |
| 6.2 | Registry emits each plugin's style modules and `when`; the module manifest carries the plugin name per module | `lib/plugins/styles.generated.js`, `tools/css-modules.js` | `css:check`, `css-modules.test.js` | `dist/styles/manifest.json` names the owning plugin of every plugin module |
| 6.3 | Loader and floor: `when: used` plugin modules leave the start-up floor and load when the plugin is detected (source `detect` as the hint, the HTML scan as the authority) | `docs/src/lib/style-loader.ts`, `tools/style-needs-common.json` | `tools/style-loader-gate.mjs` on all decks, Chromium and WebKit | 0 differing elements; floor bytes for a no-plugin deck measured before and after |
| 6.4 | Bundle report groups bytes by owning plugin | `tools/bundle-report.mjs` | — | report shows per-plugin CSS and runtime bytes |
| 6.5 | Unchanged by design: `dist/lattice.css`, `lattice-min.css`, Export-to-Marp and the VS Code stylesheet keep every plugin (a recipient may add a slide that uses one). A plugin turned off in export settings is already trimmed from the HTML player by `player-prune.js` | — | `css:check` byte-identical | stated in the note's §5 |

Order: after Phase 0 (the report proves the bytes) and alongside `2794-p3`, since the floor it changes is the one that
followup ships.

### Guards from the adversarial review (2026-11-19)

A red team, a Munger inversion and a checker read this plan on a real build. Each guard is a precondition of the item
that cites it; the evidence is in PR #3313's body.

- **G1 (0.1).** `bundle:report` never writes into `dist/`: `tools/build-dist-readme.js` lists whatever `dist/` holds, so
  the README and the npm tarball would depend on whether someone ran an on-demand tool.
- **G2 (1.1).** `tools/minify-css.js` keeps every comment matching `/@(?:theme|size)\b/`, so four prose comments already
  ride into `lattice-min.css`, which is the Export-to-Marp `lattice.css`. First anchor that regex to a directive line, in
  its own commit, and show the four-comment diff for export sign-off (Quality Bar). Stripping `dist/styles/` changes
  every module hash, so regenerate `tools/style-needs-common.json` in the same commit and record any membership change.
  The cheaper byte win: point `README.md`'s embed section at the `-min` files, which every shipped surface already uses.
- **G3 (1.2).** With `sourcemap: 'linked'`, `runtime:check` builds to a temp name, so the JS ends in a
  `sourceMappingURL` that never matches. Normalize that line, diff the `.map` too, and delete the temp `.map`. The Marp
  kit strips any trailing `sourceMappingURL` (not only `data:` URLs), and the kit test asserts none remains.
- **G4 (2.1, 2.4).** A rule is deletable only when no manifest variant, `.docs.md` modifier, lint vocabulary entry,
  `lib/` template producer (a census of producers, not a grep of decks) or host mode (`lattice-exporting`, fluid, pane,
  present, player, every `@size`) can produce its classes. The corpus computed-style gate is a regression check: it
  passes by construction for a rule no deck matches, so it never proves a rule dead. Deleting a documented class is a
  **Breaking:** changelog entry and an owner decision. Coverage decks from 2.2 cannot be the evidence that 2.4 deletes on.
- **G5 (3.1).** Tokens may live in `:where()`; the painted properties stay in each component's rule at today's
  specificity, because a zero-specificity surface loses to any earlier palette rule or author CSS
  (`lib/export/player-core.mjs` already depends on the card's exact specificity). A change to that is **Breaking:** with
  an author-CSS before and after.
- **G6 (4.1).** Lower with esbuild `{ target: 'esnext', supported: { nesting: false } }`, not `target: chrome91`, which
  also adds hex fallbacks in front of `oklch()`. Make `distributeLeadingIs` (`lib/core/leading-is.js`) throw on a
  leading `:is()` whose arms differ in specificity: esbuild's `:is(section.a, figure.a.b) .x` distributed to two arms
  drops the section arm from (0,3,1) to (0,2,1).
- **G7 (6.x).** Plugin modules are in the start-up floor because the corpus scan found most decks need them, so "used by
  the plugin's own test" is a second definition of used that disagrees with the first. 6.0 settles which one is right
  before the contract changes.

## 4. Owner decisions (2026-11-19)

| # | Question | Owner's answer | What it means for the plan |
|---|---|---|---|
| D1 | Detect unused code continuously | **Pre-push hook, after the findings are sorted.** | First sort today's knip findings (20 files, 16 packages on 2026-11-19; many are files loaded indirectly, which knip cannot see): teach `knip.json` about them, delete what is truly dead, re-bless `test/quality/baseline.json`. Then add a lefthook pre-push job that fails only when unused files, exports or packages grow. Measured cost: knip 6.7 s against a pre-push of about 73 s (lint 9.0 s, `lint:deck:all` 3.9 s, `build:check` 60.1 s). |
| D2 | `lib/authoring/fact-check-core.js` | **Open: investigate first.** | Built 2026-06-16 (#389 design, #395 code) as the deterministic first half of a deck fact-check feature (`2026-06-16-deck-fact-checking.md`, proposed). The AI verdict layer and its Drawing Board panel were never built, and the Drawing Board has since been removed. No issue or followup tracks it. Keep it with an issue that names the Studio as its home, or delete it: a product call. |
| D3 | Size budget in CI | **Replaced: growth metrics on the pre-merge card.** | No CI budget. `npm run card` reports what a PR adds and removes, from git, by kind: docs, code, comments, CSS, tests. Cheap (git numstat plus a comment count on changed files), fast and exact. |
| D4 | Phase 4 nesting spike | **Yes: try it and measure it against the alternatives.** | 4.1 runs with G6 and reports, for flat (today) vs nested vs any other candidate: source bytes and repetition, shipped bytes minified and gzipped, build time, specificity changes and the computed-style diff on every deck. 4.2 waits on those numbers. |
| D5 | Card surfaces (Phase 3) | **No uniform look.** | Every card look that ships today stays available. Phase 3 builds one extensible card contract: shared slots and tokens, with each component's current look expressed as its own token values, so a new look is a new set of values rather than a new hand-built card. 3.3 never normalizes; zero visual change unless a deck asks for one. |
| D6 | Plugin styles load when used | **Yes (option A).** | Phase 6 goes ahead, step 6.0 first (G7): if the start-up floor already defers a plugin's module, that plugin becomes a data edit, not a contract change. |

## 5. Not doing

- Splitting the shipped files for Marp: Marp inlines named imports, so it saves nothing and adds configuration.
- Subsetting Export-to-Marp: the recipient keeps editing and must have every component.
- Loading map basemaps on demand: inlining them is the offline contract (row 6).
