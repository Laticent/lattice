---
status: in-progress
summary: Diagnosis of why the live PERFORMANCE overlay shows LCP/FRAME/TOTAL red on mobile, measured against the production build. The owned engine render is already fast (39ms/58 slides, the green RENDER 19ms); the red needles are all cold-start / full-write BROWSER costs — LCP (6049ms) is gated on the Studio's client:only island hydration (empty <body>), and FRAME (1027ms) is a full iframe srcdoc write re-parsing 563KB of unscoped CSS plus a cold-fetched runtime. Front A (LCP) is SHIPPED here as an SSG instant-shell for studio.astro — the newcomer's first slide (DECKS[0]) rendered to static HTML + jsdom/css-tree critical CSS (563KB→15KB gz) plus a server-rendered welcome banner, gated to first-time indaco·light visitors, dismissed by StudioShell on the live preview's first render (DeckPreview onFirstRender). Measured before→after at CPU 4x/6x + Slow-4G: LCP 1156/1751ms → 304/531ms, now decoupled from hydration (LCP===FCP), turning the real-phone 6049ms green. EngineWarm downgraded from allowEager (was competing with first paint). Follow-on (not yet done): a neutral shell for RETURNING visitors (the screenshot case); docs-side then engine-side CSS scoping for FRAME; runtime lazy-split; metrics-band recalibration + a browser-side FRAME/LCP bench.
---

# Preview performance — where the red needles actually come from

**Date:** 2026-07-11 · **Status:** diagnosis + proposed program (pre-implementation)
**Trigger:** the live PERFORMANCE overlay on `lattice.style` shows LCP, FRAME, and
TOTAL in the red on mobile; "I'm not feeling the performance numbers."

This note is the *understanding* deliverable. It records what was measured, against
the **production build**, and what it means — before any optimization lands. All
per-stage costs below are reproducible headless-Chrome measurements at 1× and 4×
CPU throttle (4× ≈ a mid-tier phone), plus the committed engine bench.

---

## TL;DR

**The engine is already the fast part. The browser is the slow part, and only on
cold start.** A faster parser / AST would optimize the one needle that is already
green (`RENDER 19ms`). The red needles are all **cold-start / full-write** costs:

| Needle | Reported | Root cause | Not the cause |
|---|---|---|---|
| **LCP 6049ms** | poor | `studio.astro` is `client:only` with an empty `<body>` → largest paint waits on React+CodeMirror island hydration; `EngineWarm allowEager` competes for bandwidth | the engine bundle; the iframe (subframe content is excluded from top-frame LCP) |
| **FRAME 1027ms** | poor | every render is a **full `srcdoc` write**; the iframe re-parses **563KB of unscoped CSS** and cold-fetches + parses the runtime `<script src>` before `onload` fires | slide weight; the markdown parser |
| **TOTAL 1074ms** | poor | = RENDER 19 + SANITIZE 3 + FRAME 1027 + overhead; it is FRAME | the engine |

Typing is **already fast** (INP 56ms green) on the filmstrip hosts because
`deck-preview.js` patches only changed `<section>`s. The pain is the *first* render
and the Studio's single-slide path, which has **no patch path**.

---

## What was measured

### Engine (Node, production workloads) — GREEN
`npm run bench`: 58-slide jargon deck renders in **39.0ms** (committed baseline
32.6ms; within noise). 348-slide stress deck: 133ms. The engine is ~1500 slides/s.
The `RENDER 19ms` overlay value is the per-edit EMA of this same path. **Not a
bottleneck.**

### FRAME — the full `srcdoc` write, broken down (headless Chrome, production `dist`)
`out.css` = **563KB for *any* deck** — a one-heading deck emits the identical sheet
to the 58-slide deck. CSS is **not scoped to the components a deck uses**; every
render inlines the whole component library.

Runtime shipped to the iframe is the **minified** build (`dist/lattice-runtime.min.js`
staged as `lattice-runtime.js`, 397KB raw / 137KB gz) — *not* the 2.5MB debug
artifact. The "ship the min build" win is already done.

Marginal parse/layout cost inside the frame:

| srcdoc contents | 1× | 4× (≈phone) |
|---|---|---|
| **Single title slide** (what Studio previews) | | |
| slide DOM only | 2ms | 5ms |
| + 563KB CSS | 46ms (+44) | 139ms (**+134**) |
| + min runtime | 76ms (+30) | 230ms (+91) |
| **Full 58-slide deck** (Playground filmstrip) | | |
| slide DOM only | 15ms | 141ms |
| + 563KB CSS | 180ms (+165) | 791ms (**+650**) |
| + min runtime | 216ms (+36) | 970ms (+179) |

**CSS parse is the dominant FRAME cost.** The real-phone 1027ms adds the cold-cache
**network fetch** of the runtime (137KB gz over cellular) on top of parse — a
one-time cost that collapses once cached. Warm-cache FRAME for the single-slide
Studio is ~230–350ms locally.

### LCP — structural, not engine
`studio.astro:147` mounts `<StudioShell client:only="react">` in an otherwise empty
`<body>`; nothing server-renders. The largest contentful paint is a main-document
text node the island paints *after* it downloads, parses, and hydrates
(React + shadcn + CodeMirror). `EngineWarm allowEager` (`:148`) pulls the 505KB-gz
engine bundle in parallel, delaying that first paint further. The preview iframe
**cannot** be the LCP element (subframe exclusion). `playground.astro` is milder —
`PlaygroundApp` is `client:load` with an Astro-owned shell — but still text-gated on
hydration.

---

## Two meta-findings about the measurement itself

1. **The bench measures the green needle.** `npm run bench` times only the Node
   engine render (already fast); it never touches FRAME or LCP — the needles that
   are actually red. HARD RULE #19 evidence for a preview-perf change needs a
   *browser-side* measurement that doesn't exist yet.
2. **The FRAME band is miscalibrated for what it measures.** `good < 16ms` is a
   single-frame budget, but FRAME is a whole-document parse + runtime script load —
   16ms is physically unreachable for a full `srcdoc` write. The card's "why"
   ("heavy slides cost more here") is misleading: the cost is cold-cache runtime
   fetch + CSS re-parse, not slide weight. The panel is telling a partly false
   story, which is part of "not feeling the numbers."

---

## Proposed program (ordered by impact; details deferred to implementation PRs)

### A. LCP — make first paint independent of JS (SRE + front-end) — **SHIPPED**
1. **SSG instant-shell** for `studio.astro` (`docs/scripts/ssg-first-slide.mjs` +
   `critical-css.mjs`): the newcomer's first slide (`DECKS[0].slides[0]`) is rendered
   through the owned engine at build time to static HTML + its **critical CSS**
   (css-tree AST + jsdom selector match prunes 563KB → ~15KB gz), dropped into a
   no-JS shell alongside a server-rendered twin of the welcome banner (the largest
   above-the-fold text → it becomes the LCP element). The slide scales fluidly via
   its own container queries (`width:100%` + `aspect-ratio`), so there's no JS
   measure and no layout shift. `StudioShell` dismisses the shell (fade) on the live
   preview's first render via a new one-shot `DeckPreview` `onFirstRender` — so the
   static slide holds until the live one is ready, never a blank gap; a 12s mount
   backstop guarantees a broken engine can't trap the user behind it. **Gated** to a
   first-time visitor on the default look (no `lattice-studio-deck-index`, indaco,
   light) by the pre-paint seed script — for a returning user the welcome slide is
   the wrong content, so they keep the prior first paint.
   **Measured (headless Chrome, production `dist`, CPU 4×/6× + Slow-4G, n=5 median):**
   LCP **1156/1751ms → 304/531ms**; FCP the same; the rendered slide reaches the main
   document at ~FCP (was *never* — it only ever lived in the excluded iframe). LCP now
   equals FCP — it is a server-rendered element, so it is **decoupled from hydration
   and CPU** (before it scaled with device slowness → the real-phone 6049ms; now it
   stays ~300–600ms, i.e. green, regardless of device).
2. **Stopped eager-warming the engine before first paint** — `EngineWarm allowEager`
   → intent-gated `EngineWarm` on `studio.astro`; the 505KB fetch no longer competes
   with hydration (`StudioShell` still loads the engine on mount).
3. **Delivery (NOT yet done):** brotli + `Cache-Control: immutable` on the
   content-hashed `v/<hash>/` assets (Cloudflare Pages, already used for PR previews)
   — GitHub Pages can express neither. Infra decision, deferred.
4. **Returning-visitor shell (NOT yet done):** the shell is gated to first-time
   visitors; a returning user (the screenshot case) still gets the island-gated first
   paint. A neutral (deck-agnostic) shell for them is the next slice.

### B. FRAME — stop re-parsing everything on every write (front-end + engine)
1. **Scope the preview CSS to used components.** 563KB → est. 50–100KB for a typical
   deck. Biggest FRAME lever. **Fork:** do it *docs-side* (post-process `out.css`
   before inlining — safe, no export impact) vs *engine-side* (change `render().css`
   — bigger win, reused everywhere, but **changes exported bytes → export sign-off
   gate**).
2. **Parse the CSS once.** Serve the theme sheet as a cached `<link>` / adopted
   stylesheet the frame reuses across writes, instead of re-inlining it into every
   `srcdoc`.
3. **Give the single-slide Studio a patch path.** `single-slide-render.ts` full-writes
   on every render; port the `patchSections` / resident-document model from
   `deck-preview.js` so post-first renders skip the full doc rebuild.
4. **Warm the runtime** (preload) so the cold network fetch is off the first-render
   critical path.
5. **Lazy-split the runtime's heavy transforms** (chart family + 159KB GeoJSON
   basemaps + QR) behind their registry selectors so a plain-text deck parses a small
   core. Secondary — the min build already helps.

### C. Metrics honesty (so the panel tells the truth)
1. Recalibrate FRAME/TOTAL bands; split **cold first render** from **warm re-render**
   so a green warm number isn't hidden behind a red cold one.
2. Add a **browser-side FRAME/LCP bench** (puppeteer, CPU-throttled, production
   `dist`) to the perf tooling so these needles are tracked with real evidence.

### Explicitly *not* the plan
A faster parser, an AST, look-ahead — these target `RENDER 19ms` / `39ms/58 slides`,
already green. Per-slide engine caching is redundant with the DOM patch path. Nothing
here needs them. (Recorded so the option is closed with a reason, not forgotten.)

---

## Verification contract
Every change reports before/after **against the production build**: engine via
`npm run bench`; FRAME via the new browser-side bench at 1×/4× throttle; LCP/FCP via a
real Lighthouse-mobile run on the built docs. No needle is called "good" without an
artifact from the surface it names (HARD RULE #23).
