---
status: proposed
summary: A cold Studio load pulls ~2.7MB over the wire, nothing gates it, and the eager JS has grown 615KB->899KB gz (+46%) in the 29 days since the Editor lazy split shipped - heavier than before that optimisation. Measured, not estimated - fonts are the largest single category (1.17MB, 43 files, of which 254KB is KaTeX for a slide with no math), CodeMirror rides the eager path via one chat-syntax-highlighting import and thereby nullifies that Editor split, and 312KB of JSON catalog is inlined into the HTML. Route-level splitting is genuinely excellent; the Studio island itself is the monolith.
---

# The Studio's loading budget: what is eager, what is lazy, and what it costs

**Status:** audit. Nothing here is implemented. Every number below is measured on the
real built site (`npm run build` + `astro preview` + a Chromium network trace), not
inferred from source. Estimates are labeled **(est)** and are the only unmeasured
figures.

## The short version

Route-level loading is in very good shape and should not be touched: a docs page ships
**1-2KB of JavaScript**. The problem is entirely inside one route. `/studio/` ships
**899KB gz of JavaScript across 51 chunks before it will show you anything**, and that
is only a third of the story - the full cold load is **~2.7MB on the wire**.

Three findings matter more than the rest, and none of them is "the bundle is big":

1. **Fonts are the biggest category, and mostly unused.** 43 font files, 1.17MB, all
   fetched into the preview iframe. 20 of them (254KB) are KaTeX math faces downloaded
   for a slide with **zero** math on it. Another ~288KB is the same five typefaces
   shipped twice under two different URL schemes.
2. **The `Editor` lazy split has been silently defeated.** The decision doc for it
   claims ~196KB gz moved off the critical path. Measured today it saves **20KB** -
   because a *chat syntax-highlighting helper* statically imports six CodeMirror
   language grammars, dragging the whole CodeMirror stack (202.6KB gz) back onto the
   eager path where it merges with the very chunk the split was meant to defer.
3. **Nothing gates any of this, and it is already drifting.** There is no per-PR
   payload budget. The only watch is a *nightly, non-blocking* relative check with a
   3%/10KB tolerance - about **78KB of headroom per day** on the Studio's script
   weight. The cost of that shows up in one number: the Editor-split decision doc
   measured Studio eager JS at **615KB gz on 2026-07-19**. Today it is **899KB gz** -
   **+284KB, +46% in under a month**, and *larger than the 816KB it was before that
   optimisation shipped*. Every byte of that growth passed the nightly watch, because no
   single day added 3%.

So: the answer to "are we doing well or badly" is **both**, sharply split. The
architecture-level decisions (Astro islands, on-demand engine, modulepreload injection)
are good and were clearly made deliberately. The Studio island has since accumulated
into a monolith underneath them, and no gate noticed.

---

## 1. What a cold `/studio/` load actually costs

Measured: Chromium, cache disabled, `astro preview` on the production build, 12s
window. Sizes are gzip for text assets (what the wire carries from GitHub Pages) and
raw for `.woff2` (already compressed).

| Category | Files | Wire size | When | Eager? |
|---|---:|---:|---|---|
| HTML document | 1 | 75.5KB | t=125ms | yes |
| Site CSS (`landing.css`) | 1 | 28.6KB | t=146ms | yes |
| Studio island JS (`modulepreload` + entry) | 53 | **899.0KB** | t=330-410ms | yes |
| Engine (`lattice-playground.js` + `lattice-runtime.js`) | 2 | 484.5KB | t=990-1116ms | on demand* |
| Engine theme CSS (`lattice.css`) | 1 | 77.8KB | t=1006ms | on demand* |
| **Fonts** | **43** | **1174.0KB** | t=297-1276ms | yes (see §3) |
| Everything else (manifest, icons) | 3 | 45KB | - | yes |
| **Total** | **117** | **~2.7MB** | | |

\* "on demand" is technically true and practically false: the engine is loaded via a
dynamic import rather than bundled, but the Studio's whole job is to show a preview, so
it is demanded ~600ms into every single cold load. It is correctly *architected* as
on-demand; it is not *avoided*.

For contrast, the same measurement across other routes - this is the part that is
working well:

| Route | HTML (gz) | JS (gz) | CSS (gz) |
|---|---:|---:|---:|
| `/studio/` | 75.5KB | **900.1KB** (53 files) | 28.6KB |
| `/playground/` | 112.3KB | 490.7KB (35 files) | 34.6KB |
| `/components/` | 47.9KB | **1.0KB** (1 file) | 31.3KB |
| `/` (landing) | 21.9KB | **1.0KB** (1 file) | 29.8KB |
| docs pages | ~16KB | **2.3KB** (3 files) | 36.5KB |

A docs page shipping 2.3KB of JS is a genuinely good result and is what Astro's island
model buys. The Studio is 390x that.

---

## 2. What is already loaded dynamically (the good news)

The Studio does have real code-splitting. Walking Rollup's own chunk graph from the
island entry, following only *static* import edges for "eager" and *dynamic* edges for
"lazy":

- **Eager: 51 chunks, 899.0KB gz**
- **Lazy: 25 chunks, 624.0KB gz** - fetched only when something asks

That is **41% of the island's code already deferred**, which is not nothing. The
existing dynamic boundaries:

| Lazy boundary | Size (gz) | Triggered by |
|---|---:|---|
| `player-core.generated.js` | 62.8KB | HTML player export |
| `player-prune-browser.ts` | 61.3KB | HTML player export |
| `Fabricate.tsx` (+5 chunks) | 56.7KB | opening the Fabricate tab |
| `lamejs` | 56.7KB | MP3 narration encode |
| `jszip` | 29.3KB | zip export |
| `Editor.tsx` (+3 chunks) | 20.4KB | editor pane mount |
| `anima-scenes.ts` | 19.7KB | motion scenes |
| `deck-export.js` | 9.1KB | export |
| `voice-model.js` | 6.0KB | TTS |
| `font-embed`, `lattice-file`, `download`, `narration-projection` | <3KB | export paths |

Also genuinely good, and worth *not* regressing:

- **`modulepreload` injection** (`scripts/inject-modulepreload.mjs`) resolves the
  island's transitive static chunks at build time and hints them all at once, so the
  browser fetches 51 chunks in parallel instead of discovering them one waterfall depth
  at a time. It deliberately walks static edges only, so it never de-lazifies a
  `React.lazy` boundary. This is careful work.
- **Engine excluded from `prefetch`.** `prefetchAll: true` warms every internal link on
  hover, but the ~554KB engine is explicitly held back behind a connection-aware policy
  rather than speculatively spent on a metered link.
- **Theme CSS is fetched on demand and shared** through a module-level cache keyed by
  theme base, so N preview hosts share one ~570KB string instead of N copies.
- **KaTeX *CSS* is already conditional** - `deck-preview.js` only injects the KaTeX
  stylesheet when the rendered HTML actually contains `katex`. (The fonts are not; see
  §3. The gate exists and works; it is being bypassed by a different code path.)

---

## 3. Finding: 1.17MB of fonts, mostly for glyphs nothing renders

This is the largest single line item on the cold load and, as far as I can find, has
never been audited.

**Measured.** The preview iframe (`about:srcdoc`) requests **43 font files totalling
1174KB**. The main document requests 2. Inside that iframe:

- 1 slide is rendered.
- `document.querySelectorAll('.katex').length` is **0**.
- The only families any element's computed style references are Times New Roman,
  Outfit, Playfair Display and JetBrains Mono.
- Yet `document.fonts` reports **17 KaTeX families loaded**, plus Caveat and Shantell
  Sans, which **no element references at all**.

The mechanism: the preview iframe inlines a **706KB `<style id="lattice-theme">`**
carrying **54 `@font-face` rules**, of which the engine's own `lattice.css` contributes
**37** - including every KaTeX face. The CDP initiator for those requests is `parser`,
not script: the browser is materialising faces declared in that inlined blob.

Two separable costs:

| Waste | Size | Why |
|---|---:|---|
| KaTeX math faces on a deck with no math | **253.7KB** (20 files) | `lattice.css` declares all KaTeX `@font-face` unconditionally; the CSS-level gate in `deck-preview.js` doesn't cover the theme blob |
| Same typeface served under two URL schemes | **~288KB** | site build emits hashed `/_astro/outfit-300.<hash>.woff2`; playground themes emit `/playground/v/<ver>/themes/fonts/outfit-300.woff2`. Both are fetched. Affects Caveat (73KB), Shantell (77KB), Playfair (75KB), Outfit (32KB), JetBrains (31KB) |
| Display faces for themes that aren't active | remainder | Caveat + Shantell Sans load though the active theme is `cuoio` |

**Roughly 540KB of the 1174KB is recoverable without any user-visible change** - about
20% of the entire cold load, and it is the cheapest win on this page because it needs no
architectural change, only scoping `@font-face` declarations to the active theme and
de-duplicating the two font URL schemes.

---

## 4. Finding: the `Editor` lazy split is defeated by chat syntax highlighting

`engineering/decisions/2026-07-19-defer-editor-hydration.md` moved CodeMirror behind
`React.lazy`, and the in-code comment states it took "~196KB gz" off the cold hydration
path. **Measured today, the `Editor` lazy chunk is 20.4KB gz** and a 202.6KB gz chunk
containing the entire CodeMirror stack is `modulepreload`ed on cold load.

The chunk in question, `editor-diagnostics.<hash>.js`, contains 23 modules:
`@codemirror/state`, `view`, `language`, `autocomplete`, the `@lezer` runtime, and six
language grammars (`css`, `html`, `javascript`, `json`, `markdown`, `python`) - plus one
172-line, zero-dependency source file, `playground/editor-diagnostics.js`.

Every other CodeMirror consumer is correctly behind a lazy boundary:

| Consumer | Reached via | Lazy? |
|---|---|---|
| `editor-complete.ts` | `Editor.tsx` | yes |
| `editor-theme.ts` | `Editor.tsx`, `CodeField.tsx` | yes |
| `manifest-complete.ts` | `Fabricate.tsx` | yes |
| **`chat-highlight.ts`** | **`StudioShell` → `ArchitectChat` → `ChatCodeBlock`** | **NO** |

`chat-highlight.ts` statically imports six `@codemirror/lang-*` grammars to colourise
code blocks in Architect chat replies. Its own header explains the choice as
"zero-new-dep" reuse of grammars the editor already needs - which was true *before* the
editor became lazy, and is the whole trap: reusing a dependency is free only when that
dependency is on the same loading tier as you.

Because it is eager, Rollup groups CodeMirror into an eager chunk, and the pure
`editor-diagnostics.js` module - pulled in eagerly by `coach/coach-core.ts` for one
function, `buildVocabSets` - lands in it too. Deferring `chat-highlight` (chat replies
with code blocks are not a cold-load concern) should return most of that 202.6KB to the
lazy tier and restore the `Editor` split to the size its doc claims.

This is the clearest example of the structural risk the audit was asked about: a lazy
boundary is not a property of the module you deferred, it is a property of *every* path
that reaches its dependencies. Nothing in the build tells you when a new static import
quietly re-anchors a deferred subsystem.

---

## 5. Finding: 312KB of JSON inlined into the HTML

The Studio HTML document is 433KB raw / 75.5KB gz. **312KB of it (72%) is a single
`props` blob** serialised into the Astro island:

| Prop | Raw | gz | Needed at boot? |
|---|---:|---:|---|
| `components` (component catalog) | 192.5KB | 36.2KB | No - consumed by the Add-slide picker and the Architect primer |
| `lintVocab` | 41.5KB | 9.3KB | Only when linting runs |
| `slideBlocks` / `slideHeadings` / `options` | 5.1KB | 1.1KB | Yes |

~45KB gz of catalog data is parsed and blocked on before the page can hydrate, to serve
a modal the user may never open. This is the category the request anticipated - "maybe
there are other things besides CSS and JS". **Data is the third axis, and here it is the
one nobody has looked at.** Moving the catalog to a fetched, cached JSON asset would cut
the HTML by ~60% and is independent of every other change here.

---

## 6. What is eager that plausibly should not be

The eager island chunk is 385KB gz / 1208KB raw and bundles **260 modules** - 155 own
source files and 105 from `node_modules`. Grouped by feature, with the largest
deferrable candidates:

Sizes marked **(est)** are derived from each group's share of pre-bundle source bytes
scaled by the chunk's measured overall compression factor (0.146 gz-KB per source-KB).
They are directionally right, not exact - only an actual split measures the true number.

| Subsystem now eager | Est. gz | Entered by | Already gated? |
|---|---:|---|---|
| **ComposeView + ProseMirror** (13 vendor modules, 693KB src) | **~111KB (est)** | switching to the Compose pane | `visible` prop; not the default pane |
| **Present mode** (`PresentOverlay`, presenter window, rehearsal, `vetrina/stage`) | ~44KB (est) | pressing Present | `if (!open) return` |
| **Narration / read-aloud / TTS** (`read-along-core`, `narration-bake`, voice catalog) | ~44KB (est) | narration UI | mostly unused per session |
| **Architect AI** (`architect.ts`, model, edits, chat) | ~30KB (est) | opening Architect | panel-gated |
| **Fabricate cores leaking eager** (`layout-core`, `theme-core`) | ~26KB (est) | - | **`Fabricate.tsx` is lazy, but `component-library.ts` / `architect.ts` / `manifest-complete.ts` pull its cores eagerly** |
| **Workspace sheet** | ~12KB (est) | opening Workspace | `if (!open) return` |
| **Share / print / export options** | ~12KB (est) | export | panel-gated |
| **Slide picker + Library** | ~11KB (est) | Add slide | modal |
| **Command palette** | ~4KB (est) | Cmd-K | always mounted |

Two things stand out. First, **`ComposeView` + ProseMirror is the single largest
deferrable block** - ~111KB gz of a WYSIWYG editor that is not the default pane
(`markdown` is), sitting on the cold path of every load. Second, **`Fabricate`'s cores
leak past its own lazy boundary** for the same reason CodeMirror does: three eager
modules import from `layout-core.generated.js` directly, so the 127KB core loads even
though the tab that needs it does not.

The encouraging part: `PresentOverlay` and `WorkspaceSheet` already early-return when
closed, and `Fabricate` already proved the `React.lazy` + `Suspense` pattern works here.
These are drop-in splits, not refactors.

---

## 7. What protects any of this today: nearly nothing

| Gate | Blocks merge? | What it measures |
|---|---|---|
| `preview-work-budget.test.ts` | **yes** | *render work per keystroke* - counts, not bytes |
| `check-studio-shell.mjs` | yes | the pre-paint skeleton exists |
| `check:modulepreload-coverage` | no - nightly | preload hints still cover the island |
| `perf-nightly.yml` (Lighthouse HEAD vs ~24h base) | no - files an issue | `script-size` at **3% / 10KB** tolerance |
| **payload budget per route** | **does not exist** | - |

The per-PR Lighthouse budget was deliberately retired in
`2026-06-15-docs-perf-gating-policy.md` because absolute thresholds rotted and flapped
on runner variance - a sound decision for *wall-clock* metrics. But `script-size` is
deterministic, and it inherited the relative-nightly treatment anyway. At the Studio's
~2.6MB raw script weight, a 3% tolerance is **~78KB of silent headroom per day**.

So the concern in the request - "as we grow this will be problematic" - is not
speculative, and not a forecast. It is already measured:

| Studio eager JS | Date | Source |
|---|---|---|
| 816KB gz | 2026-07-19, before the Editor split | `2026-07-19-defer-editor-hydration.md` |
| **615KB gz** | 2026-07-19, after the Editor split | same doc, measured on a real build |
| **899KB gz** | 2026-08-17 (this audit) | measured on a real build |

**+46% in 29 days**, ending up heavier than the state the optimisation was written to
fix. Every finding in §3-§6 arrived this way: no single PR did anything wrong enough to
trip a 3% nightly delta, and the one optimisation that did land has since been more than
undone - partly by §4, which re-anchored the very subsystem it deferred.

---

## 8. Pros and cons: what we do now vs. what we could do

**Today's approach - one big eager island, a few hand-placed lazy boundaries**

| Pros | Cons |
|---|---|
| Simple: one island, no orchestration, no loading states to design | Everyone pays for every feature; the Present-only user funds ProseMirror |
| No chunk-load failure surface beyond the two existing boundaries | A lazy boundary silently re-anchors when any eager module touches its deps (§4, §6) |
| No Suspense fallbacks to design or test | Cost grows with feature count, and the gate can't see the growth (§7) |
| Once loaded, everything is instant - no in-session waits | Mobile cold load is the worst case, and it is the case the Studio most needs to win |

**The alternative - split by interaction surface**

| Pros | Cons |
|---|---|
| Cold load drops toward what the first screen needs | Each boundary needs a loading state that doesn't feel broken |
| Cost of a new feature is paid by users who open it | `React.lazy` chunks can fail to load on a stale deploy - though `chunk-load.ts` already handles exactly this, well |
| Makes the eager path legible, so a budget gate becomes meaningful | A split you don't gate will silently re-merge (§4 is the proof) |
| The patterns already exist in-repo (`Fabricate`, `Editor`) | Splitting a panel that shares state is more than moving an import |

The honest read: this is not a case where the current approach was wrong. It is a case
where **the correct approach was applied to two modules in 2026-07 and never extended,
while eleven more subsystems landed on the eager side of the line.**

---

## 9. If this is picked up, the order that de-risks the most per unit of work

Sequenced by measured-value-to-effort, not by size:

1. **Scope `@font-face` to the active theme; de-duplicate the two font URL schemes**
   (§3). ~540KB, the single biggest win, no architecture change, no loading state.
2. **Defer `chat-highlight.ts`** (§4). ~200KB, restores a split that already shipped,
   and no user-facing behaviour changes since chat code blocks appear after a model
   reply.
3. **Add a per-route payload budget to the PR gate** (§7). Small, and without it 1, 2
   and 4 regress silently - it is what makes the rest durable. Deterministic bytes are
   exactly what the 2026-08-03 "count the work, don't clock it" insight says *can* be
   hard-gated.
4. **Split `ComposeView` + ProseMirror** (§6). ~111KB (est), largest remaining, and
   `visible` already gates it.
5. **Close the `Fabricate` core leak** (§6) - the lazy boundary exists; three imports
   bypass it.
6. **Move the component catalog out of the HTML** (§5). ~45KB gz and a 60% smaller
   document.

Steps 1-3 are roughly **740KB off a 2.7MB cold load - a 27% reduction** - and none of
them changes a single interaction.

## What this audit does not cover

- **Mobile behaviour on real hardware.** Everything here is desktop Chromium in a
  headless sandbox. Per HARD RULE #23, the mobile cold-load experience is
  **UNVERIFIED**; the payload numbers are device-independent but the felt cost is not.
- **Runtime memory and long-session behaviour.** This is a *loading* audit;
  `2026-07-20-studio-degradation-audit.md` covers the in-session side.
- **Whether each split is worth its loading state.** §6 sizes the prize, not the UX
  cost. That judgement belongs with whoever picks the work up.
- **The `/playground/` route** (490.7KB gz, 35 chunks), which was measured for contrast
  but not analysed. It likely shares findings §3 and §4.
