---
status: proposed
summary: >
  Brief for a new session to explore a generic, fast style loader that scans a document and loads only
  the CSS its units need (base, then the themes, components, finishes and fonts actually used) instead of
  one 2.7 MB lattice.css. Gathers what the preview-library audit measured (a 4K gallery deck carries a
  2.5 MB stylesheet, 47% of it embedded fonts; one slide matches about 400 KB of the 1.3 MB of rules;
  every poster capture copies about 1.8 MB), what already exists to build on (the player prune, the
  theme fetcher, plugin admission, the lazy JS loaders), the constraints the repo's hard rules put on
  it, and an ordered set of experiments with baselines to beat. Nothing is built.
---

# On-demand styles: a deck-scoped style loader (brief, 2026-10-17)

**Status: proposed. Nothing is built.** This is a hand-off for a fresh session. Read it, then do the
"design before code" step in §5 before touching CSS or the build.

## 1. The ask, in the owner's words

> "We really could use a runtime library that is generic, that can scan the deck and only load styles
> for the specific slides that are needed, not one gigantic lattice.css. lattice.css would just have
> base styles. Dynamic fetch of sorts. We don't need a theme we don't use. We don't need a component we
> don't use. We don't need a finish we don't use. And so on. The library needs to be super fast and
> efficient. It needs to be generic and usable in different domains."

Three requirements fall out of that: **small** (a unit pays only for what it uses), **fast** (scanning
and loading must cost less than they save), and **generic** (no Lattice knowledge in the core; Lattice
is one adapter, the way the Fuoco hub and `deck-outline` are).

## 2. Where this came from

The preview-as-a-library audit (`engineering/decisions/2026-10-16-preview-as-library-audit.md`, §11b to
§11c; branch `claude/preview-adaptive-library-db7rfe`) built a poster map of cached slide images. The
poster capture is an SVG image, and an SVG image cannot see the page's stylesheet, so every capture
copies the whole sheet. That is how the sheet's size became the dominant cost of a capture. The question
the owner then asked is the bigger one: why does any surface carry CSS a slide does not use?

## 3. What we measured (reproduce before you trust it)

Deck: `test/integration/baseline-decks/gallery.md` (120 slides, declares `size: 4K`, rendered with
`node lattice.js <deck.md> out.html -q`). Chromium 131 and Playwright's Linux WebKit; not iOS.

| Fact | Number |
|---|---|
| `dist/lattice.css` | 2,662,086 B (minified 933,322 B) |
| The gallery page's `<style>` blocks | 4 blocks, about 2,497 KB |
| of which embedded fonts | 1,186 KB (47%): 37 `@font-face` faces as base64 `data:` URLs, 17 families (Shantell Sans 227 KB, Playfair Display 202, Outfit 163, Caveat 130, JetBrains Mono 123, KaTeX 20 faces about 340) |
| of which layout and component rules | 1,311 KB (53%): about 5,150 rules; about 140 KB gzipped |
| Component stylesheets | 75 files, 1,343,285 B (`lib/components/*/*.styles.css`), concatenated into `lattice.css` by `tools/build-css.js` |
| Themes | 37 directories under `themes/`; the page's per-deck palette block is about 18 KB |
| HTML of the 120 slides | 423 KB total, 3.5 KB per slide |
| Rules one slide matches (loose matcher) | 400 to 420 KB of the 1,311 KB, so about 31%. **The "base" is not small today**; most of that is rules that apply to every slide |
| That matcher's cost | 8.7 s for 120 slides, about 72 ms per slide, so it needs a precomputed index |
| One poster capture | about 1.8 MB of CSS copied into the SVG, 150 to 300 ms of main thread (decode 60 to 155 ms, rule selection 60 to 165 ms, base64 10 to 20 ms) |
| Baking every slide | about 214 MB of CSS parsed to draw 120 small images |
| Pruning font faces to the used families | SVG 2,135 to 1,778 KB (-17%), pixel-identical |
| Pruning to the rules a slide matches | SVG about -58%, pixel-identical; selection cost about equalled the saving |

Related measured facts you will need: `section[data-lattice-slide]` carries `width/height ... !important`
from the deck's `size:`, and the engine writes `--_sec-1cqi` as a pixel constant (38.4 px at 4K) from
that size; overriding both renders a slide at another size (14 to 31 mean error if you override only the
size, 0.9 to 4.6 if you override both). Inserting a `<style>` element on a hot path made WebKit scrolling
much worse (at most 2 frames over 50 ms became about 50 in a fast map scroll); install rules once.

**Re-derive the table** with a small Playwright script over the rendered gallery: sum `<style>` text
lengths, split `@font-face` from the rest, and for each `section` count the bytes of rules whose
selector `matches` the section, a descendant, or an ancestor. The previous session's scripts were
throwaway and are not committed; rebuild them, and commit the baseline script so the next number is
reproducible (HARD RULE #19).

## 4. What already exists (read before building; HARD RULE #15)

- **The build.** `tools/build-css.js` concatenates `lib/_theme.css`, `_root.css`, `_base.css`,
  `_scaffold.css`, every component's `styles.css` alphabetically, `_modifiers.css`, the base treatments
  and sketch finish, the plugin slot, `_semi-universal.css`, `_universal.css` and
  `_diagram-overrides.css`. **Source order is the cascade.** Any split must reproduce that order.
- **The only existing CSS trimmers.** `lib/export/player-prune.js` (css-tree, then a computed-style gate
  in Chromium across views; the safelist and its history are in
  `2026-10-16-player-as-library-audit.md` §4.1, including the gaps), `docs/scripts/critical-css.mjs`
  (build-time, css-tree), and `docs/src/playground/snapshot-cache.js` (walks the live CSSOM and keeps
  matching rules). The Studio's webpage export prunes "to the used selectors/faces" (`player-prune:build`).
- **Fetch on demand already exists for themes and JS.** `docs/src/lib/theme-fetch.ts` (the
  `ensureThemes` pattern, in-memory cached), `docs/src/lib/ensure-charts.ts`, `ensure-katex.ts`,
  `ensure-hljs-language.ts`, `ensure-plugin-data.ts`. Plugins already contribute `styles`
  (`lib/plugins/*`, the "plugin slot" in `build-css.js`), and the engine already admits plugins per deck
  (`pluginAdmission`, `lib/plugins/drawn-probe.mjs`). The engine also reports what a deck needs
  (`chartsNeeded`, `missingLanguages`).
- **Manifests.** Every component has a `*.manifest.json` (`lib/components/manifest.schema.json`);
  themes have `*.manifest.json` and a theme graph baked into the catalog. Check whether they already say
  enough to build a dependency graph before inventing a format.
- **Caches and versioning.** `docs/src/lib/sw-version-evict.test.ts`, `stale-deploy-recovery.js`,
  `asset-version.mjs`. Immutable, content-hashed chunks fit this.
- **Sibling libraries** and their conventions: `docs/src/lib/{fuoco,lente,tavola,trama,calco,segno,suono,cadenza}`.
  The generic-core test Fuoco set itself (one set of views over three document types with no change) is
  the right bar here too.

## 5. Design questions to settle first (CLAUDE.md "design-before-code"; one `AskUserQuestion` round, measured options, a recommendation)

1. **What is a style module?** Candidates: base, per-component, per-theme or palette, per-finish, per-modifier,
   per-plugin, per-font-face. Declare for each: `id`, `css`, `requires`, `order`, and what it adds at
   runtime (the safelist problem from the player prune, made a declaration).
2. **How does the scanner know what a unit needs?** Static scan of Markdown and front matter (`_class`,
   modifiers, `theme:`, `finish:`), scan of the rendered HTML (`data-class`, classes, attributes), or the
   engine reporting it as it renders (it already knows). Ground truth for correctness is the computed-style
   gate. **False negatives must be zero**; false positives only cost bytes.
3. **Delivery.** Build time per deck (CLI, PDF, PPTX, player export: no network), runtime chunk fetch (docs
   site, Studio, Playground, preview), or both from one manifest. HTTP/2, content-hashed immutable chunks,
   and warm-cache behavior across decks.
4. **Cascade order under async loading.** Chunks must apply in `lattice.css` order and the first paint
   must not flash unstyled content. HARD RULE #26 forbids half-layering the bundle, so do not reach for
   `@layer` as the fix.
5. **Fonts (47% of the bytes).** Fetch woff2 files separately with `unicode-range` subsetting, versus
   embedded `data:` URLs only for standalone exports. A font face in a shadow root does not apply on every
   engine; verify before relying on shadow DOM.
6. **Size-dependent tokens.** `--_sec-1cqi` and the section size come from the deck's `size:`. Decide whether
   they are build-time constants or runtime variables, because a capture at another size needs them.
7. **What is generic.** A core that knows only modules, a dependency graph, an order, a scanner interface
   and a loader. Lattice is the adapter. Name two other domains and prove one (see §8).
8. **Scope of the first slice.** Recommended: split without behavior change first (§6, E1), so every later
   step is measured against a byte-identical baseline.

## 6. Experiments, in order of what each unblocks

| # | Experiment | Done when |
|---|---|---|
| E0 | **Baseline.** A committed script that prints the §3 table for any deck on both engines, plus first-paint time, style recalc time, bytes transferred and parsed, and request count for the first slide, cold and warm (`docs/scripts/playground-bench.mjs` is the existing harness). | A table in the decision note, same machine, both engines, with the variance stated. |
| E1 | **Split with no behavior change.** `build-css.js` emits per-module files plus a manifest; a gate proves the modules concatenated in order are byte-identical to today's `lattice.css`. | The gate is green and a reviewer can see the diff is structure only. |
| E2 | **Dependency inventory.** For the 281 example and baseline decks, compute each unit's needs by two scanners and compare both to the computed-style gate. | Zero false negatives on every deck; the false-positive byte cost is reported per scanner. |
| E3 | **Runtime loader prototype** in the Playground with the manifest from E1 and the scanner from E2. | First-slide bytes and time against E0, cold and warm, on Chromium and WebKit; no flash of unstyled content; a unit that appears later loads its module before it shows. |
| E4 | **Generic core extracted**, with a second, non-slide domain driven through it unchanged (a docs page with components, or an embeddable widget set). | The core imports nothing Lattice; the second domain needs no core change. |
| E5 | **Integrations.** Poster capture takes the unit's minimal CSS from the loader; the CLI and exports build per-deck bundles from the same manifest. | Capture payload and time against §3; **export bytes are a change the owner must see** (see §7). |

## 7. Rules that bind this work (read the docs, not this summary)

- **#1** shared kernel, not one render path. **#2** never hand-edit `dist/`. **#3** no hex in layout CSS.
  **#15** reuse (grep `dist/engineering/capabilities.md` for prune, critical, bench before building).
  **#17** one line of work, one branch, one PR, one commit per item. **#19** a performance change ships
  before and after numbers from the same machine, the committed baseline re-blessed, and a bench scenario
  that covers the optimized path. **#20** no margin in engine layout CSS. **#21** US English.
  **#22** every `<style>` goes through `sanitizeStyleText`: a loader that injects fetched CSS is a style
  sink, so read `2026-08-17-theme-css-is-a-preview-sink.md` §5 and §9 first and add any allowlist entry
  with its justification. **#23** a "verified" claim names its surface and carries an artifact from it (a
  WebKit and a Chromium run, not "CI green"). **#25** this is engine CSS and build infrastructure: use the
  maker-checker tier at least, and the adversarial trio for the final shape. **#26** no partial `@layer`.
  **#28** a merge ask carries the pre-merge card from `workflow.md`. **#30** plain, active, short.
- **Export sign-off.** A change that alters the bytes of an exported artifact (PDF, PPTX, HTML player, font
  embedding) needs the owner's inspection: render a representative deck in dark and light and send it.
- **Changelog.** User-visible change gets a `changelog.d/` fragment (HARD RULE #10).
- **Process.** Design first and confirm in one `AskUserQuestion` round; measure any number you can measure in
  under a minute; no CI step or hook is added without asking (second filter in `CLAUDE.md`).

## 8. Pitfalls the last session already paid for

- Never add or remove a stylesheet on a hot path (WebKit re-matches the whole sheet; measured).
- An SVG image does not load external fonts or images; inline them as `data:`. Wrap CSS in CDATA (the
  sheet holds literal `<`). Capture at native size, never scaled inside the SVG (WebKit renders it wrong).
- Slide numbers, ids and pagination are baked into each slide's HTML, so content keys must normalize position.
- Run every measurement on Chromium and WebKit; they disagreed on cost by 2x and on correctness twice.
- Playwright's WebKit needs `npx playwright install-deps webkit` once in this sandbox.
- Every number here comes from Linux engines. Real iPhone or iPad behavior is UNVERIFIED (HARD RULE #23).

## 9. Deliverables

A decision note `engineering/decisions/<date>-on-demand-styles.md` with the E0 baseline and the forks put to
the owner; the committed baseline script; E1 as its own commit; then whichever of E2 to E5 the owner picks.
Hand back with the pre-merge card, and log anything pending as `followups.d/` files named by priority
(`<origin-pr>-p<n>-<slug>.md`).
