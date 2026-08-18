---
status: proposed
summary: A cold Studio load pulls ~2.83MB across 117 requests, and no per-PR gate watches any of it. The three findings that survived adversarial review - fonts (1.17MB, 43 files, 254KB of it KaTeX for a slide with no math), CodeMirror riding the eager path via one chat-syntax-highlighting import, and 312KB of JSON inlined into the HTML - are real and independently reproduced. But the service worker serves every hashed asset cache-first, so these are FIRST-VISIT costs; the cost that repeats on every launch is parse and hydrate, which reorders the fix list. Route-level splitting is genuinely excellent; the Studio island is the monolith.
---

# The Studio's loading budget: what is eager, what is lazy, and what it costs

**Status:** audit. Nothing here is implemented.

**On the numbers.** Measured on the real built site (`npm run build` → `astro preview` →
a headless Chromium trace, plus a walk of Rollup's own `chunk-graph.json`). Text assets
are gzip level-6 over the built artifacts; `.woff2` is raw. Two classes of figure are
**not** measurements and are labeled inline: the per-subsystem savings in §6 (marked
**(est)**, derived from source-byte share) and the July baseline in §7 (marked
**(not reproducible here)**).

An earlier draft of this document opened "every number below is measured." That was
wrong, and the adversarial trio (HARD RULE #25) caught it — along with six wrong
numbers and a misattributed mechanism. §10 records what changed and why.

## The short version

Route-level loading is in very good shape and should not be touched: a docs page ships
**2.3KB of JavaScript**. The problem is inside one route. `/studio/` references
**976KB gz of JavaScript across 59 chunks** before it becomes interactive, inside a
**~2.83MB** cold load.

Three findings survived independent verification:

1. **Fonts are the largest single category** — 43 files, 1.17MB, ~41% of the cold load,
   nearly all of it into the preview iframe. 20 KaTeX faces (254KB) load for a slide
   with **zero** `.katex` elements. Roughly **415KB** is byte-identical redundancy.
2. **The `Editor` lazy split is defeated.** A *chat syntax-highlighting* helper
   statically imports six CodeMirror grammars, pulling the whole 202KB gz CodeMirror
   stack onto the eager path where it merges with the chunk the split was meant to
   defer.
3. **Nothing gates any of this.** No per-PR payload budget exists. The only watch is
   nightly, non-blocking, and relative, at ~40KB/day of headroom.

**But the frame matters more than any of the three.** `docs/public/sw.js:246` serves
`/_astro/` and `/playground/v/<hash>/` **cache-first**. So every byte above is a
**first-visit or post-deploy** cost. What repeats on every launch is **parse and
hydrate** — and the Studio's own iOS discard loop
(`2026-07-20-studio-degradation-audit.md`) makes cold reloads routine, each one a cache
hit for bytes and a full re-pay for parse. Ranked by *recurring* cost the priority order
is close to the reverse of what byte size suggests: 1.17MB of `.woff2` costs ~zero parse;
976KB gz of JS costs ~2.8MB of parse, every launch.

---

## 1. What a cold `/studio/` load actually costs

Chromium, cache disabled, `astro preview` on the production build, 12s window,
deduplicated by URL. (Re-run with `serviceWorkers: 'block'` under Playwright: byte-identical,
117 requests both ways — the service worker does not perturb a *first* load.)

| Category | Files | Wire | Recurs per launch? |
|---|---:|---:|---|
| HTML document | 1 | 76.9KB | **yes** — re-parsed, blocks hydration |
| Site CSS | 1 | 28.6KB | no — cache-first |
| **Eager island JS** | **65** | **1003.5KB** | **bytes no, parse+hydrate yes** |
| Engine JS (`lattice-playground` + `lattice-runtime`) | 2 | 484.5KB | bytes no, parse yes |
| Engine theme CSS | 2 | 80.9KB | no |
| **Fonts** | **43** | **1174.0KB** | **no** — cache-first, and no parse |
| Everything else (manifest, icons) | 3 | 45.0KB | no |
| **Total** | **117** | **~2893.5KB (~2.83MB)** | |

Two JS figures, because two questions: **976.1KB / 59 chunks** is what the HTML
*references* (eager by markup); **1003.5KB / 65 chunks** is what a cold load actually
fetches, the difference being chunks pulled a frame later by the Editor warm (§4).

For contrast — and this is the part that is working well:

| Route | HTML (gz) | JS (gz) | CSS (gz) |
|---|---:|---:|---:|
| `/studio/` | 76.9KB | **976.1KB** (59 files) | 28.6KB |
| `/playground/` | 112.3KB | 490.7KB (35 files) | 34.6KB |
| `/components/` | 47.9KB | **1.0KB** (1 file) | 31.3KB |
| `/` (landing) | 21.9KB | **1.0KB** (1 file) | 29.8KB |
| docs pages | ~16KB | **2.3KB** (3 files) | 36.5KB |

A docs page shipping 2.3KB of JS is what Astro's island model buys. The Studio is 424x
that.

---

## 2. What is already loaded dynamically (the good news)

Walking Rollup's chunk graph from the island entry: **eager 59 chunks / 976.1KB gz**,
**lazy 25 chunks / 624.0KB gz** — **41% of the island's code already deferred.**

| Lazy boundary | Size (gz) | Triggered by |
|---|---:|---|
| `jspdf.es.min` | 122.0KB | PDF export |
| `pptxgen.es` | 95.0KB | PPTX export |
| `player-core.generated.js` | 62.8KB | HTML player export |
| `player-prune-browser.ts` | 61.3KB | HTML player export |
| `Fabricate.tsx` (+5 chunks) | 56.7KB | opening the Fabricate tab |
| `lamejs` | 56.7KB | MP3 narration encode |
| `html2canvas.esm` | 46.0KB | rasterized export |
| `jszip` | 29.3KB | zip export |
| `Editor.tsx` (+3 chunks) | 20.4KB | editor pane mount |
| `anima-scenes.ts` | 19.7KB | motion scenes |
| `deck-export.js` · `voice-model.js` · 4 smaller | <16KB each | export / TTS paths |

Genuinely good, and worth not regressing:

- **`modulepreload` injection** (`docs/scripts/inject-modulepreload.mjs`) resolves the
  island's transitive chunks at build time and hints them at once, so the browser
  fetches them in parallel instead of discovering them one waterfall depth at a time.
  It follows static edges plus **one documented exception** —
  `eagerDynamicImportSuffixes: ['src/playground/authoring-core.generated.js']`
  (`:59`), a chunk the Editor's linter needs on essentially every load. No `React.lazy`
  boundary is de-lazified: `Editor.*.js` and `Fabricate.*.js` are confirmed absent from
  the preload list.
- **Theme CSS is fetched on demand and shared** through a module-level cache keyed by
  theme base, so N preview hosts share one ~570KB string.
- **KaTeX's *stylesheet* is conditional** — `deck-preview.js:312` gates it on
  `html.indexOf('katex') !== -1`. (The Studio's preview is built by a *different*
  builder, `single-slide-render.ts:682`, which is why the fonts still land; see §3.)
- **`EngineWarm` gates its prefetch on Save-Data.** Note the asymmetry: **`RuntimeWarm`
  does not** — `RuntimeWarm.astro:43` emits an ungated
  `<link rel="prefetch" as="script">` for the 163KB gz runtime, deliberately
  (`:32-33`), because every app page renders a preview. So "the engine is held back on a
  constrained link" is true of the engine bundle and **false of the runtime**.

---

## 3. Finding: 1.17MB of fonts, and the mechanism is a deliberate force-load

**Measured.** The preview iframe (`about:srcdoc`) requests **43 font files totalling
1174KB**; the main document 2. Inside that frame: 1 slide rendered,
`document.querySelectorAll('.katex').length` is **0**, the only families any element's
computed style references are Times New Roman, Outfit, Playfair Display and JetBrains
Mono — yet `document.fonts` reports **17 families loaded, 12 of them KaTeX**, plus
Caveat and Shantell Sans which **no element references**.

**The mechanism is not passive CSS.** A declared-but-unused `@font-face` is not fetched
by Chromium. The actual cause is script: `lib/core/font-settle.js:27` calls `f.load()`
on **every** face in the `FontFaceSet`, invoked unconditionally at runtime boot
(`lib/runtime/index.js:2907`). That is a **correctness mechanism** — a first overflow
measurement must not be taken against fallback metrics — not an oversight. The probe
proves it: 54 faces, **`unloaded: 0`**, with zero `.katex` elements. (An earlier draft
blamed the parser; the `initiator=parser` attribution is real but the inference from it
was wrong.)

Redundancy, by kind:

| Waste | Size | Notes |
|---|---:|---|
| KaTeX faces on a deck with no math | **253.7KB** (20 files) | `lattice.css` declares all 20 unconditionally |
| **Byte-identical *within* one scheme** | **~199.9KB** | `outfit-300/500/600` are one file; so are `jetbrains-400/500/600`, `playfair-400/700`, `playfair-italic-400/700`. Each gets its own `@font-face` at a distinct weight pointing at a distinct filename, so the frame downloads the same bytes three times |
| Byte-identical *across* the two URL schemes | **~215.1KB** | site emits `/_astro/<name>.<hash>.woff2`, playground themes emit `/playground/v/<ver>/themes/fonts/<name>.woff2` |
| Same typeface, different cut | ~73KB | Caveat: `_astro/caveat-400` (74,932B) matches **no** playground file. Recoverable only with a glyph-coverage decision |

Total byte-identical redundancy in the frame: **~415KB**. Verify with
`md5sum assets/fonts/*.woff2 | sort | uniq -w32 -D`.

**The cheap fix is not the one it looks like.** `docs/src/lib/single-slide-render.ts:620`
prepends `fontFaceCss` from `previewFontFaceCss()` (`font-embed.js:106`) on top of the
theme blob's own 37 faces. Its justification (`font-embed.js:103-105`) is that "the
engine's Google-Fonts `@import` is inert inside the srcdoc" — but the engine has no
Google-Fonts `@import` any more (`tools/build-css.js:355` emits self-hosted faces;
`theme-fetch.ts:100-106` rewrites their URLs). The block is **vestigial**, and its supply
is degraded: `docs/src/playground/fonts/` holds **17 filenames but only 6 distinct
files**. Deleting `fontFaceCss +` is one line, docs-side, with no export impact.

---

## 4. Finding: the `Editor` lazy split is defeated by chat syntax highlighting

`2026-07-19-defer-editor-hydration.md` moved CodeMirror behind `React.lazy`; the in-code
comment claims "~196KB gz" came off the cold hydration path. **Measured today, the
`Editor` lazy chunk is 20.4KB gz** and a **202.6KB gz** chunk containing the whole
CodeMirror stack is `modulepreload`ed.

That chunk, `editor-diagnostics.<hash>.js`, holds `@codemirror/state`, `view`,
`language`, `autocomplete`, the `@lezer` runtime, six language grammars — and one
172-line, dependency-free source file, `playground/editor-diagnostics.js`.

Every other CodeMirror consumer is correctly behind a lazy boundary:

| Consumer | Reached via | Lazy? |
|---|---|---|
| `editor-complete.ts` | `Editor.tsx:9` | yes |
| `editor-theme.ts` | `Editor.tsx:10`, `CodeField.tsx:11` | yes |
| `manifest-complete.ts` | `Fabricate.tsx:30` **only** | yes |
| **`chat-highlight.ts`** | **`StudioShell:40` → `ArchitectChat:10` → `ChatCodeBlock:4`** | **NO** |

`chat-highlight.ts:12-17` statically imports six `@codemirror/lang-*` grammars to
colourise code blocks in Architect chat replies. Its header explains the choice as
"zero-new-dep" reuse of grammars the editor already needs — true *before* the editor
became lazy, and the whole trap: **reusing a dependency is free only when that dependency
is on the same loading tier as you.** Rollup then groups CodeMirror into an eager chunk,
and the pure `editor-diagnostics.js` — pulled eagerly by `coach/coach-core.ts:8` for one
function — lands in it too.

**What deferring it actually buys.** Not ~200KB off the wire.
`StudioShell.tsx:754-756` unconditionally warms `import('./Editor')` on mount, so
CodeMirror arrives on the same cold load either way (observed at ~1083ms). The win is
**pre-hydration parse time** — which, per the caching frame above, is the cost that
*recurs*. That makes this finding more valuable than a byte count suggests, not less.

This is the clearest instance of the structural risk: **a lazy boundary is not a property
of the module you deferred, it is a property of every path that reaches its
dependencies.** Nothing in the build reports when a new static import re-anchors a
deferred subsystem.

---

## 5. Finding: 312KB of JSON inlined into the HTML

The Studio HTML is 433.1KB raw / 76.9KB gz. **312.0KB of it (72%) is a single `props`
blob** serialised into the Astro island:

| Prop | Raw | gz | Needed at boot? |
|---|---:|---:|---|
| `components` (catalog) | 179.8KB | 35.6KB | No — the Add-slide picker and Architect primer |
| `lintVocab` | 37.0KB | 9.1KB | Only when linting runs |
| `slideBlocks` / `slideHeadings` / `options` | 4.6KB | 1.1KB | Yes |

(Raw values are the compact JSON as it sits in the document; an earlier draft reported
~7% higher because the measuring script re-serialised with padded separators.)

~45KB gz of catalog data is parsed before hydration to serve a modal the user may never
open — and unlike the font bytes, **this cost recurs on every launch.** Moving the
catalog to a fetched, cached JSON asset would cut the HTML ~60%.

---

## 6. What is eager that plausibly should not be

The eager island chunk is 385KB gz / 1208KB raw across **260 modules** — 155 own source,
105 from `node_modules`.

Sizes marked **(est)** are each group's share of pre-bundle source bytes scaled by the
chunk's measured compression factor (0.146 gz-KB per source-KB). Directionally right,
not exact — only an actual split measures the true number.

| Subsystem now eager | Est. gz | Entered by | Already gated? |
|---|---:|---|---|
| **ComposeView + ProseMirror** (13 vendor modules, 693KB src) | **~111KB (est)** | the Compose pane | `editMode === 'compose'`; not the default |
| **Present mode** (`PresentOverlay`, presenter window, rehearsal, `vetrina/stage`) | ~44KB (est) | pressing Present | `if (!open) return` |
| **Narration / read-aloud / TTS** | ~44KB (est) | narration UI | mostly unused per session |
| **Architect AI** (`architect.ts`, model, edits, chat) | ~30KB (est) | opening Architect | panel-gated |
| **`authoring-core.generated.js`** (lint kernel) | **75.1KB (measured)** | — | eager + preloaded by the §2 exception |
| **Fabricate cores leaking eager** (`layout-core` 126.7KB *source*, `theme-core`) | ~26KB (est) | — | **`Fabricate.tsx` is lazy, but `component-library.ts:10` and `architect.ts:19` import its cores directly** |
| Workspace sheet · Share/print · Slide picker + Library · Command palette | ~39KB (est) total | panel/modal-gated | `if (!open) return` |

`ComposeView` + ProseMirror is the largest deferrable block, and it is already
conditionally rendered — a `React.lazy` there is near-drop-in. `PresentOverlay` and
`WorkspaceSheet` already early-return when closed, and `Fabricate` proved the pattern.
Two eager modules bypass Fabricate's boundary — not three; `manifest-complete.ts` is
reached only through the lazy tab.

---

## 7. What protects any of this: nearly nothing

| Gate | Blocks merge? | What it measures |
|---|---|---|
| `preview-work-budget.test.ts` | **yes** | *render work per keystroke* — counts, not bytes |
| `check-studio-shell.mjs` | yes | the pre-paint skeleton exists |
| `check:modulepreload-coverage` | no — nightly | preload hints still cover the island |
| `perf-nightly.yml` (Lighthouse HEAD vs ~24h base) | no — files an issue | `script-size` at **3% / 10KB** |
| **payload budget per route** | **does not exist** | — |

`perf-nightly.yml` triggers on `schedule` + `workflow_dispatch` only, and captures its
comparison into an output so the job stays green — it **structurally cannot block a
merge**. `/studio/` *is* in its URL list, so the drift below did pass under it.

**The headroom is ~40KB/day, not 78KB.** The gated metric is Lighthouse
`resource-summary` **`transferSize`** (`perf-regression.mjs:108`), i.e. compressed bytes
(~1335KB for a cold Studio load), not raw. An earlier draft applied 3% to the raw figure
and doubled the number.

**On growth *(not reproducible here)*.** `2026-07-19-defer-editor-hydration.md` measured
eager JS at 615,373 B gz across 67 chunks, defining it as "every `/_astro/*.js` chunk
referenced in `dist/studio/index.html`". Applying **that same rule** to today's build:
**59 chunks / 976.1KB gz — +58%**, and above the 816KB the split was written to fix.
Treat this as *indicative, not established*: this checkout is a **shallow clone** (51
commits, history begins 2026-08-11), so the July tree cannot be rebuilt and re-measured,
and the chunk count moving 67 → 59 while bytes rose is unexplained. The directional claim
— eager JS is now heavier than before that optimisation — holds under every filter tried.

**On adding a budget.** `2026-06-15-docs-perf-gating-policy.md` retired the per-PR
Lighthouse budget for **two** reasons: runner-variance flapping *and* absolute thresholds
**rotting** as the site legitimately grows. Determinism answers the first only. And
`2026-08-03-performance-guard.md` does not say "deterministic things can be gated" — it
says the regression that hurt was **a count, not a duration**, and warns
(`:382-387`) against a gate "justified by what number a healthy run produces." A naive
byte ceiling seeded from today is exactly that, and at ~0.4%/day of drift any tolerance
loose enough to pass a legitimate feature would have passed this one.

The repo already has the right idiom: `tools/check-ownership.js` runs budget-0 +
sanctioned-allowlist gates that fail on **stale** entries (HARD RULES #20, #22, #26). A
committed per-route byte ledger in that shape — failing when exceeded **and** when the
recorded number is stale-loose — makes growth appear **in the diff of the PR that causes
it**, which is the attribution the nightly cannot give.

---

## 8. Pros and cons: what we do now vs. what we could do

**Today — one big eager island, a few hand-placed lazy boundaries**

| Pros | Cons |
|---|---|
| Simple: one island, no orchestration, no loading states | Everyone pays for every feature; the Present-only user funds ProseMirror |
| Once loaded, everything is instant — no mid-session waits | A lazy boundary silently re-anchors when any eager module touches its deps (§4, §6) |
| Fewer chunk-load failure surfaces on a stale deploy | Parse + hydrate cost recurs every launch, and the iOS discard loop makes launches frequent |
| No async mount ordering between components sharing state | Cost grows with feature count and no gate can see it (§7) |

**The alternative — split by interaction surface**

| Pros | Cons |
|---|---|
| Cold *parse* drops toward what the first screen needs | Each boundary needs a loading state that doesn't feel broken |
| A new feature is paid for by users who open it | The Editor split needed a skeleton, a warm effect, and still only *reordered* its parse |
| Makes the eager path legible, so a budget becomes meaningful | Splitting components that share `StudioShell` state can introduce mount-order bugs |

This is not a case where the current approach was wrong. It is a case where **the correct
approach was applied to two modules in 2026-07 and never extended**, while nine more
subsystems sat on the eager side of the line.

**The deeper constraint is coupling, not payload.** `StudioShell.tsx` is 4717 lines and
imports ComposeView, ArchitectChat, PresentOverlay and the rest directly — a
god-component's static import list *is* the eager set. Payload is the symptom. That
decomposition is a much larger program than anything here, and this audit names it rather
than proposing it.

---

## 9. If this is picked up: ordered by *recurring* cost

Re-ordered from an earlier draft, which ranked by wire bytes and so led with the one
category the service worker already makes free.

1. **Defer `chat-highlight.ts`** (§4). ~200KB gz of CodeMirror **parse**, every launch.
   Restores a split that already shipped; chat code blocks appear after a model reply, so
   no cold-load behaviour changes.
2. **Close the Fabricate core leak** (§6). The lazy boundary exists; two imports bypass it.
3. **Move the component catalog out of the HTML** (§5). ~45KB gz of parse-blocking JSON
   and a 60% smaller document.
4. **Split `ComposeView` + ProseMirror** (§6). ~111KB (est), largest remaining, already
   conditionally rendered — but design the skeleton first, per the Editor precedent.
5. **Delete the vestigial `previewFontFaceCss()`** (§3) — `single-slide-render.ts:620`,
   one line, docs-side, no export impact. Removes a stale weight-collapsed font supply.
6. **Gate the KaTeX faces** at `theme-fetch.ts:100-106`, the seam that already
   special-cases KaTeX URLs — **not** in `lattice.css`. ~254KB, docs-side.
7. **Add a per-route byte ledger** in the `check-ownership.js` idiom (§7), not a naive
   threshold. Without it, 1-6 regress silently.

**Deliberately demoted:** "scope `@font-face` to the active theme," which an earlier draft
ranked first as the cheapest win. It is the **most** governed item on the list, not the
cheapest: `dist/lattice.css` is a **published export artifact** (`package.json` `files`),
consumed by the runtime, the engine, `player-core.mjs` and the PDF path, and its KaTeX
faces are self-hosted deliberately (`tools/build-css.js:320-330`) so math renders with
zero network. Changing it alters exported artifact bytes — CLAUDE.md's **stop-and-show-me
export gate** — and every face carries `font-display: swap`, so a theme-scoped face set
risks a FOUT on what `single-slide-render.ts:1225` calls "the DOMINANT repeated action."
Items 5 and 6 recover most of the same bytes at docs-side seams instead.

## 10. What the adversarial trio changed

Run per HARD RULE #25 (red team · Munger inversion · independent checker), each in a
fresh context against the shipping draft. All three reproduced the CodeMirror chain, the
font census, and the gating table independently. What they broke:

- **The framing.** Neither the service worker's cache-first policy nor the
  parse-vs-bytes distinction appeared in the draft. This reordered §9 substantially.
- **The mechanism in §3** — `settleFonts`, not the CSS parser.
- **Six numbers**: eager JS 899 → 976.1KB (the draft's filter missed the React renderer
  and five overlay islands, 76KB, all fetched at ~405ms); headroom 78 → ~40KB/day;
  `components` 192.5 → 179.8KB; "17 KaTeX families" → 12; the stale "554KB engine";
  a §1 table whose file counts did not foot.
- **Two claims withdrawn**: "~740KB / 27%" (the Editor warm means step 1 saves parse, not
  wire) and "every number below is measured."
- **Two attributions corrected**: `manifest-complete.ts` is not an eager puller;
  `modulepreload` injection has one documented dynamic-edge exception.

Two agent findings were themselves **refuted** on re-check and are recorded so they are
not re-litigated: the service worker does **not** perturb a first-load trace (blocked vs
allowed are byte-identical, 117 requests each), and `authoring-core.generated.js` is
genuinely statically imported (`PrintOptionsPanel.tsx:36`, `architect.ts:18`), not a
measurement artifact.

## What this audit does not cover

- **Mobile behaviour on real hardware.** Desktop Chromium in a headless sandbox only.
  Per HARD RULE #23 the mobile cold-load experience is **UNVERIFIED**; byte counts are
  device-independent, felt cost is not.
- **Whether each split is worth its loading state.** §6 sizes the prize, not the UX cost.
- **Runtime memory and long-session behaviour** — `2026-07-20-studio-degradation-audit.md`.
  Note the two audits meet: the font force-load re-materialises 43 faces per iframe
  realm, which is that audit's territory, not this one's.
- **The `/playground/` route** (490.7KB gz, 35 chunks), measured for contrast only. It
  likely shares §3 and §4.
- **Off-path, logged not fixed** (HARD RULE #18): `docs/lighthouserc.cjs:35-36` still
  measures `/drawing-board/` and `/workbench/`, retired routes that now redirect — two of
  the nightly's seven URLs.
