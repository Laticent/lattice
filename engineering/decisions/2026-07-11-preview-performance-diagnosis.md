---
status: shipped
summary: Diagnosis + program for why the live PERFORMANCE overlay showed LCP/FRAME/TOTAL red on mobile, measured against the production build, and the four merged fixes that turned them green. The owned engine render was already fast; the red needles were all cold-start / full-write BROWSER costs. SHIPPED (#913/#917/#921/#924): (A) an SSG instant-shell + returning-visitor snapshot → LCP ~6000ms → ~370ms; (B) a resident-document PATCH path → warm-edit FRAME ~485ms → ~2ms; (C) a regime-honest perf panel + a browser-side FRAME/LCP bench; (D) memoized theme→CSS composition → warm-edit RENDER ~141ms → ~9ms (4× CPU). PARKED: per-component CSS scoping (dominated by the existing pruner) and the map-basemap runtime split (would blank Marp-export maps). See the Status ledger below for the current truth; the body keeps the full reasoning + measurements.
---

# Preview performance — where the red needles actually come from

**Date:** 2026-07-11 · **Status:** SHIPPED (#913/#917/#921/#924) — see the ledger below
**Trigger:** the live PERFORMANCE overlay on `lattice.style` showed LCP, FRAME, and
TOTAL in the red on mobile; "I'm not feeling the performance numbers."

## Status ledger — what's the current truth (read this first)

| Item | State | Result |
|---|---|---|
| **A. LCP** — SSG instant-shell + returning-visitor snapshot (§A) | **SHIPPED** #913 | LCP ~6000ms → ~370ms (newcomer) / ~700ms (returning) |
| **B③. FRAME** — resident-document patch path (§B) | **SHIPPED** #913 | warm edit ~485ms → ~2ms (4×) |
| **C1. Metrics honesty** — regime-split FRAME/TOTAL panel (§C) | **SHIPPED** #917 | panel rates patch vs rebuild honestly |
| **C2. Browser FRAME/LCP bench** (`npm run perf:frame`, §C) | **SHIPPED** #921 | the measurement surface for all of the above |
| **D. RENDER** — memoized theme→CSS composition (§D) | **SHIPPED** #924 | warm edit RENDER ~141ms → ~9ms (4×) |
| **B④. Warm the runtime** — `<link rel=prefetch>` off the first-render path (§B) | **SHIPPED** | cold runtime request ~7000ms → ~200ms; first-render FRAME −~850ms (4×/4Mbps) |
| **A5. Dark-mode NEWCOMER shell** | **OPEN** | first-time dark-OS visitor gets no build-time shell (returning dark users are covered) |
| **B①. CSS scoping / per-component composition** | **PARKED** | dominated by the existing `player-prune` kernel; ~2× ceiling; low ROI post-B③ |
| **B⑤. Map-basemap runtime split** | **REVERTED** | would blank maps in the Export-to-Marp path (runtime is the sole map renderer there) |
| **boot-last-active-deck + slide** (§A follow-up) | **SHIPPED** 2026-07-17 | closes the non-first-deck return BLANK (not just a flash); WebKit-verified. See §A follow-ups |
| Follow-ups (gates/cleanups) | **OPEN** | #22-gate → `.astro`/snapshot sinks; scope captured CSS under `#studio-ssr-shell` |

**Trigger:** the live PERFORMANCE overlay on `lattice.style` showed LCP, FRAME, and
TOTAL in the red on mobile; "I'm not feeling the performance numbers."

This note began as the *understanding* deliverable — what was measured, against the
**production build**, before any optimization landed — and grew into the program record
as A–D shipped. All per-stage costs below are reproducible headless-Chrome measurements
at 1× and 4× CPU throttle (4× ≈ a mid-tier phone), plus the committed engine bench.

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
   static slide holds until the live one is ready, never a blank gap; an 8s mount
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
4. **Returning-visitor shell — SHIPPED.** A returning user's deck lives in
   localStorage (invisible to the build), so instead of baking their slide we
   **snapshot the live preview on leave**: `docs/src/playground/snapshot-cache.js`
   walks the preview iframe's already-parsed CSSOM, keeps the rules the rendered slide
   matches (~560KB → ~120KB, native — no css-tree in the browser), captures the slide
   HTML (chart SVGs and all) + that critical CSS + palette/mode, and stores it
   (latest-only, size-capped). `StudioShell` captures on `pagehide`/`visibilitychange`
   and once after the first render; a pre-paint replay script in `studio.astro` paints
   a matching-palette/mode snapshot into the shell before hydration. **Measured
   (headless Chrome, CPU-throttled + Slow-4G emulation, returning visit): LCP 700ms
   (light) / 1267ms (dark)** — the real last slide at ~FCP, versus the same ~6s blank
   before. Verified: the shipped replay shows the snapshot slide in isolation, and
   end-to-end the app captures the actually-rendered slide and replays it (a complex
   `kpi` slide re-renders faithfully from the CSSOM-extracted CSS).
   **UNVERIFIED on real iOS Safari (HARD RULE #23):** all numbers above are *emulated*
   mobile (headless Chrome + CPU/network throttle), not a physical device. iOS Safari
   is the returning-visitor risk surface this can't reach from the sandbox: `pagehide`
   fires there but Safari's bfcache + backgrounding can truncate a synchronous
   `localStorage` write, so the leave-capture may not always land — the
   `visibilitychange` fallback and the post-first-render capture mitigate but don't
   prove it. Treat the iOS returning-visitor path as **untested** until it's driven on
   a real device; the emulated numbers stand only for what they exercised.
5. **Dark-mode newcomer (NOT yet done):** the *build-time* newcomer shell bakes
   indaco·**light** only, so a first-time visitor whose OS is dark gets no shell (a
   returning dark user IS covered — their snapshot carries the dark render). Baking a
   dark newcomer variant is the remaining slice.

**Maker-checker (returning-visitor shell).** An independent checker cleared the
XSS-blocker criterion (the HTML injection is sanitized on the only save path) and its
fixes were folded back: the injected slide CSS is now **removed on dismiss** (a tagged
`#ssr-snap-css`, plus resetting `#ssr-newcomer-css` to `media="not all"`) — otherwise
the engine theme's **bare element selectors** (`section{…}`, `li{…}`) leaked onto the
hydrated app's own chrome once the shell faded (verified fixed); the DOMPurify pass was
**moved into `captureFromFrame`** (the capture chokepoint) so a capture-without-sanitize
path is impossible by construction; a back-to-back-capture dedupe was added. **Logged
follow-ups (#18):** the new top-document injection sink has no automated #22-gate
coverage (the gate scans iframe-`srcdoc` builders in `.js/.ts`, not `.astro` main-doc
sinks) — extend `checkPreviewHtmlSinks`; and the captured CSS is unscoped (could be
scoped under `#studio-ssr-shell`, `@import` dropped) for extra hardening.

**Adversarial trio (returning-visitor shell — HARD RULE #25).** Because the snapshot
path is a new *main-document* injection sink (novel + real blast radius), it got the
full trio — red team, Munger inversion, and an independent checker — applied to the
shipped diff. It caught what three prior single-checker passes missed:
- **Wrong-deck flash (inversion, MUST-FIX — fixed).** "How does this paint the WRONG
  thing?" The app boots `loadDeckList()[0]` (the FIRST deck), not the most-recently-
  viewed one, but the snapshot was of whatever slide the user last *left* on — a
  different deck. So the shell could flash deck B's last slide for a beat before the
  island hydrated deck A. Fixed by stamping `deckId` + `slideIndex` into the snapshot
  (`captureFromFrame`, via `captureDeckRef`/`activeSlideRef` in `StudioShell` so the
  leave-capture doesn't re-subscribe per deck/slide) and gating the pre-paint replay on
  `snap.deckId === bootId`, where `bootId` mirrors the app's `loadDeckList()[0] ?? DECKS[0]`
  exactly — the persisted `deck-index[0].id` when present, else the built-in first deck's
  id. No id match → no replay (falls to the newcomer/hidden path), so a stale or foreign
  snapshot can never paint. Verified headless against the built `dist`: a matching-deck
  snapshot paints, a wrong-deck snapshot is suppressed and the box stays empty.
- **`@import` in captured CSS (red team, defense-in-depth — fixed).** The CSSOM walk
  kept `@import` rules whole; replayed into the TOP document they'd fetch an arbitrary
  external sheet on the main origin. Dropped from capture (`collectRules`) — the engine
  inlines all faces/tokens, so a real slide never needs one.
- **Sanitize only at capture, not at storage (red team — fixed).** `captureFromFrame`
  sanitized, but a *future* writer to `saveSnapshot` wouldn't. Added an idempotent
  DOMPurify pass at the `saveSnapshot` storage boundary so an unsanitized value is
  physically unstorable, regardless of writer (#22 defense-in-depth).
- **Backstop too long (checker — fixed).** The 12s dismiss backstop left a broken-engine
  user staring at a static shell far too long; shortened to **8s**. (A first pass took it
  to 5s; a follow-up checker pushed back — on a slow-3G phone a *working* engine's 505KB
  fetch + hydrate + first render can exceed 5s, so 5s risked prematurely revealing the
  app's own un-rendered preview. 8s is the compromise; the exact ceiling wants real-device
  confirmation, #23.)
- **iOS "verified" overclaim (checker — fixed in this doc).** The returning-visitor
  numbers were emulated, not real-device; the claim is now scoped to what it exercised
  and the iOS path marked UNVERIFIED (above).

A **second independent checker** on the fold-back diff confirmed the wrong-deck flash is
genuinely closed (the gate fails closed; refs are current; `textContent` for the CSS is
the correct anti-breakout choice) and surfaced two more robustness fixes, folded in:
- **Corrupt-index crash (fixed).** `bootId` was read after the `try`, so a `deck-index`
  holding the literal `"null"` would `JSON.parse` to `null`, then `null[0]` throws
  *outside* the guard — aborting the replay before the newcomer fallback runs (a newcomer
  with a corrupt key would get an empty shell). The parse now Array-guards (`idx=[]` unless
  the parsed value is an array), so it can't throw.
- **Source-only cohort lost the shell (fixed).** A user who only ever *edited* the built-in
  deck (an `lattice-studio-src-*` key, but no persisted index — `loadIndex()` seeds from
  `DECKS` without saving) had `bootId` undefined at pre-paint, so their valid same-deck
  snapshot was suppressed and they saw *no* shell. `bootId` now falls back to the first
  built-in deck's id — the same `?? DECKS[0]` the app boots — recovering the win for them.
- **CSS-into-top-document is a new, un-gated sink (accepted, noted).** `snap.css` is
  injected verbatim (`textContent`, so no `</style><script>` breakout) into the TOP
  document. Dropping `@import` closes the arbitrary-external-sheet fetch; a residual
  CSS-native `url(https://…)` beacon in author CSS could still fire, but the impact is low
  (no secret is in the DOM at pre-paint — the OpenRouter key isn't there — and the `<style>`
  is removed on dismiss), so it's accepted. The #22 threat model covers HTML sinks only;
  scoping the captured CSS under `#studio-ssr-shell` is the logged hardening.
**Logged follow-ups (#18):** extend the #22 gate to `.astro` main-document sinks; scope
captured CSS under `#studio-ssr-shell`; add the browser-side FRAME/LCP perf gate (§C.2);
and ~~boot the most-recently-*active* deck **and slide**~~ — **SHIPPED (2026-07-17).**

**Boot-last-active-deck — SHIPPED (2026-07-17), and it was worse than a flash.** The
follow-up was framed as an intra-deck *slide* flash, but driving the real returning-visitor
path on the **actual WebKit engine** (Playwright `webkit`, Safari 26 UA — not Chromium mobile
emulation) showed the deck-level case is a hard **blank**, not a flash: the replay gates on
`snap.deckId === bootId` with `bootId = loadDeckList()[0]`, so leaving from ANY non-first deck
failed the gate and fell through to the raw ~4s cold-boot blank (the user report: "leave the
Studio on mobile, come back, stare at a blank slide for 4s"; iOS memory-reclaim discards the
tab → return is a full reload). Fix: persist `{deckId, slideIndex}` under `lattice-studio-active`
(`saveActiveDeck`/`loadActiveDeck`/`loadBootDeck`/`loadBootSlide` in `studio-store.ts`), boot the
shell from it (`StudioShell.tsx`), and derive the inline `bootId` from the **same** key in
`studio.astro` (last-active → index[0] → `DECKS[0]`, validated against index ∪ built-ins so the
two resolutions can't diverge). The wrong-deck-flash invariant is preserved: a dangling/foreign
pointer still **suppresses** the replay (never paints the wrong deck), and the pointer is forgotten
on `deleteDeck`/`clearAllDecks`. **Verified (WebKit, production `dist` via `astro preview`,
iPhone 13 descriptor):** before → engaged user on a non-first deck returns to a blank preview
(screenshot); after → the instant-shell paints the real last slide AND the app boots that same
deck+slide (reproduced across repeated runs; newcomer welcome-shell and wrong-deck suppression
both still hold). **Still UNVERIFIED (#23):** real-device iOS memory-reclaim *discard timing* —
WebKit-on-Linux runs Safari's engine and page-lifecycle events (so the replay/gate logic is
genuinely exercised) but not iOS's OS-level tab discard, so whether the leave-capture always
lands under real backgrounding still wants a physical device. The gate bug, though, is proven.

Remaining logged follow-ups (#18): extend the #22 gate to `.astro` main-document sinks; scope
captured CSS under `#studio-ssr-shell`; add the browser-side FRAME/LCP perf gate (§C.2).

**Maker-checker.** An independent checker reviewed the diff before merge; its findings
were folded back: css-tree was a phantom (transitive-only) dependency whose top-level
require could hard-break `astro build` — now declared in `docs/package.json` and loaded
lazily so a miss degrades to the graceful null; `onFirstRender` now fires on the iframe's
`load` (post-paint), not when `renderInto` merely sets `srcdoc`, so the shell can't be
dismissed over a still-blank live frame; the first-time gate was widened to the app's own
returning-user test (`deck-index` OR any `src-` key OR `settings.onboarded`) so an edited
newcomer no longer gets a stale-welcome flash; the kept `@font-face` `url(fonts/…)` refs
(which 404'd at `/studio/`) are rewritten to the absolute themes/ base so the SSG slide
uses the real faces; and the decorative overlay is `pointer-events:none` from the start.

### B. FRAME — stop re-parsing everything on every write (front-end + engine)
1. **Scope the preview CSS to used components.** 563KB → est. 50–100KB for a typical
   deck. Biggest FRAME lever. **Fork:** do it *docs-side* (post-process `out.css`
   before inlining — safe, no export impact) vs *engine-side* (change `render().css`
   — bigger win, reused everywhere, but **changes exported bytes → export sign-off
   gate**).
2. **Parse the CSS once.** Serve the theme sheet as a cached `<link>` / adopted
   stylesheet the frame reuses across writes, instead of re-inlining it into every
   `srcdoc`.
3. **Give the single-slide Studio a patch path. — SHIPPED.** `single-slide-render.ts`
   full-wrote the whole preview document on every render; it now fingerprints
   everything baked outside the `<section>` (theme·mode·geom·mermaid·author-CSS) and,
   when unchanged, patches only the resident `.lattice` body (`patchSlideBody`) — the
   parsed theme sheet and the running runtime stay put, and the runtime's observer
   re-processes the swapped section. Any sig change still full-writes. **Measured
   (production dist, real headless Chrome): a warm edit's full-document write is ~113ms
   at 1× / ~485ms at 4× CPU; the body-patch is ~1–2ms** — the FRAME/edit→paint cost the
   perf overlay showed red on warm edits. Verified on the real built Studio: an editor
   keystroke re-rendered the slide in place (iframe never reloaded — a marker on its
   `contentWindow` survived) with correct layout/theme/fonts. Cold *first* render still
   full-writes, but front A's instant-shell already masks that behind a painted slide.
   Since the multi-slide filmstrip (`deck-preview.js`) already patched, both preview
   paths now avoid the per-edit reparse.
4. **Warm the runtime** so the cold network fetch is off the first-render critical path.
   **— SHIPPED.** The engine bundle is warmed (EngineWarm / loaded on mount), but the
   runtime (`lattice-runtime.js`) was the one preview asset nobody fetched until the first
   iframe wrote its `srcdoc` — *after* the engine finished loading. On a cold load the two
   heavy fetches were serial and the runtime landed on the first-render path: measured (built
   `dist`, headless Chrome, CPU 4× + 4Mbps/150ms, a mid-tier phone) the runtime request didn't
   **start** until ~7000ms in (done ~8100ms), and the first live `write` render's FRAME was
   ~3846ms — reproducing the field report's red FRAME REBUILD 3647ms on a 270-byte slide.
   Fix: a static `<link rel="prefetch" as="script" href={runtimeUrl}>` in the `<head>` of every
   page that live-renders a slide on load (`RuntimeWarm.astro`, on `studio.astro` + `playground.astro`
   + the landing `index.astro` (its hero preview) + `ComponentsLayout.astro` (each component page's
   eager specimen); the frozen Drawing Board/Workbench are left out). The same red FRAME REBUILD showed
   on the landing (~794ms, field report) and component pages, since their previews cold-fetch the same
   runtime. `prefetch` (not `preload`) keeps it at the browser's
   lowest priority so it never competes with the render-blocking CSS / LCP element — the same
   reason A2 demoted the *engine* warm from eager — and, being used only inside a subframe, it
   sidesteps preload's "unused" warning. The URL is the SAME content-hash-versioned
   `assetBase()+'lattice-runtime.js'` the pages' `options.runtimeUrl` resolves to, so the
   prefetch and the iframe's own `<script src>` share one cache entry (a content change bumps
   the hash and busts both). **Measured post-fix:** the runtime request starts at ~200ms (done
   ~380ms) and the first-render FRAME drops ~850ms. It does NOT move time-to-first-slide much:
   that is gated by the engine bundle download+parse + hydration + the 563KB CSS reparse, which
   the SSG instant-shell (front A) is designed to mask; re-warming the *engine* eagerly is the
   remaining lever and stays closed (A2 — bandwidth contention on slow links), so the runtime
   warm is the safe, non-speculative slice. Locked by `RuntimeWarm.test.ts` (prefetch present +
   URL can't drift from the pages' `runtimeUrl`).
5. **Split the map basemaps out of the runtime bundle — ATTEMPTED, REVERTED (the naive
   cut breaks a shipping host).** The three pre-projected GeoJSON basemaps (`map.basemap*.json`)
   are inlined into `dist/lattice-runtime.min.js` by `map.transform.js`'s top-level `require`s
   — **~60KB gz, ~44% of the runtime** (137KB→77KB gz if removed). The tempting move: stub them
   out of the runtime build, since the engine bakes every map's SVG (verified: 175 `<path>`)
   before the preview runtime loads and chart-family's `applyToDom` early-returns on the
   `.chart-frame` section, so in the Studio/Playground/emulator the runtime's map pass is a
   no-op. **An independent checker caught the flaw before commit:** "the runtime never draws
   maps" is FALSE for the **Export-to-Marp bundle** (`lib/core/marp-bundle.js`, `tools/export-marp.js`)
   — a *Marp-native* artifact rendered by vanilla marp-cli / marp-vscode, NOT the Lattice
   engine, where the bundled `lattice-runtime.min.js` is the **sole** client-side renderer on
   un-baked DOM (no `.chart-frame`). There the runtime DOES call `buildMap`, and the stub renders
   a **blank map** — a user-visible regression on a "full-fidelity client-side render" promise.
   `map` IS chart-family, drawn on the same un-baked host where pie/QR/progress are drawn — it is
   NOT a "never-used passenger." The canonical `dist/lattice-runtime.min.js` is also a public
   artifact external un-baked consumers embed. Reverted; canonical runtime unchanged.
   **The correct cut keeps the basemap out of the PREVIEW's runtime only, where the engine bakes,
   while the canonical/public + Marp-export runtime keeps it** — options: (a) a second, lean
   preview-only runtime variant the docs stage for the Studio/Playground (canonical stays full);
   (b) a Mermaid-style deferred basemap fetch in the runtime, but the Marp-export bundle must then
   ship the basemap JSONs as siblings or its maps break offline; (c) an explicitly signed-off +
   CHANGELOG-`**Breaking:**`-documented degradation of Marp-export maps (rejected — degrades a
   shipping feature for bytes). **Owner direction: PARKED** — the runtime-fetch win is secondary
   (the instant-shell already paints before the runtime lands), so it's not worth option (a)'s
   third-bundle complexity now; pivoting to the engine RENDER cost (§D) instead. Lesson: the
   runtime has TWO consumer classes — engine-baked hosts (basemap dead weight) and Marp-native
   un-baked hosts (basemap essential) — so any runtime slimming must be preview-scoped, not
   applied to the shared artifact.

**Maker-checker (front B).** An independent checker cleared the patch path with no
blockers, tracing that charts/mermaid re-render via the *resident* runtime's observer
(not the one-shot script guard the `deck-preview.js` comment warns about — that only
fires on script re-execution, which the patch never does), and that the sig is complete
(`out.css` is a pure function of theme-name + geometry, both in the sig, so a patch can
never show stale theme CSS). Folded back: a **pending-load guard**
(`__latticePendingLoad`) so a same-sig render arriving before the outgoing full-write
srcdoc commits can't patch the wrong document (a latent race `deck-preview.js` also has;
fixed here on the path of this change, left off-path there per #18); a comment recording
that mermaid is keyed on the prop deliberately; and the debug overlay deferred one frame
on patch. **Logged, off-path (#18):** `StudioShell.tsx` hardcodes `mermaid={false}`, so
the Studio's live preview never injects the mermaid library and mermaid *diagrams* don't
render there — pre-existing, unchanged by this work; if the Studio later passes a
content-accurate flag, the patch path already handles it.

### C. Metrics honesty (so the panel tells the truth)
1. **Split warm patch from cold rebuild in the FRAME/TOTAL rating — SHIPPED.** The
   overlay was telling three lies about FRAME, all rooted in the patch path (B③)
   landing without the panel learning about it: (a) `render-metrics.ts` **EMA-blended**
   the ~2ms warm body-patch with the ~485ms cold full-write into one meaningless number,
   so the fast common case (typing) read as a mid-hundreds blend whenever a rare rebuild
   was in the trailing average; (b) the `good < 16ms` band judged a **full-document
   reparse** against a single-frame budget it can *never* meet (meta-finding #2); (c) the
   "why" blamed **slide weight** ("heavy slides cost more"), when the real cost is the
   stylesheet reparse a full rebuild pays and a patch skips entirely. Fix (docs-only, no
   engine/export change): the render path now stamps each sample with its regime
   (`writePath: 'patch' | 'write'` — patch at the body-swap record site, write at the
   full-srcdoc site in `single-slide-render.ts`); `render-metrics.ts` keeps a **separate
   EMA per regime** for `frameMs`/`totalMs`, so a rebuild can't poison the typing number
   and a regime change shows the new regime immediately; `perf-metrics.ts` rates FRAME/
   TOTAL **by regime** (a patch on the tight frame budget → green when fast; a rebuild on
   a realistic full-reparse band, never the impossible 16ms) and the row/detail label the
   regime ("patch" vs "rebuild") with honest what/why text. So while you type the panel
   reads the true ~2ms patch (green); a theme/size/mode switch reads the rebuild cost,
   labeled as the one-off it is.
2. **Browser-side FRAME/LCP bench — SHIPPED.** `docs/scripts/frame-bench.mjs`
   (`npm run perf:frame`, from `docs/`) drives the REAL built Studio under CPU throttle
   and reports the panel's needles BY REGIME, reading raw per-render samples off a new
   `window.__latticeRenderMetrics` tooling hook (not the overlay's EMA). It fills the gap
   the Lighthouse `npm run perf` can't: that profiles page LOAD (LCP/FCP); this profiles
   the edit→paint pipeline. **Measured (production `dist`, CPU 4×, median of 5, warm
   cache):**

   | needle | value | reading |
   |---|---|---|
   | LCP (newcomer /studio) | **400ms** | green — the front-A shell |
   | FRAME **patch** (warm edit) | **1.8ms** | the #913 body-swap fast path |
   | FRAME **write** (theme/mode/size switch) | **585ms** | the full-rebuild stylesheet reparse |
   | RENDER (engine) | **143ms** | Markdown→HTML, regime-independent |
   | TOTAL patch / write | **148ms / 820ms** | whole edit→paint |

   **This is the number that closes the CSS question.** Post-#913 the ONLY place a CSS
   reparse still bites is the **write regime (585ms)** — a theme/mode/size switch, a *rare*
   action. A warm edit's FRAME is 1.8ms; its TOTAL (148ms) is now **engine-dominated**
   (RENDER 143ms at 4×), not CSS. So CSS scoping's entire remaining addressable surface is
   the occasional 585ms rebuild — and even there the runtime re-execution + layout, not
   just CSS parse, make up the number. The biggest *felt* warm-edit cost is now the engine
   render (masked by the 140ms debounce), and the biggest *cold-start* cost is the JS fetched
   over the network — heavier oranges than CSS parse.

**Adversarial trio on the owner's per-component-CSS proposal (HARD RULE #25).** The owner
proposed composing the preview sheet from parts — always load base/universal + only the used
components' `.styles.css`, loaded dynamically and cached — rather than shipping the monolith.
Red team + Munger inversion + independent fact-checker (grounded in the pipeline map + the
sizes above) converged: **feasible but low-ROI, with correctness traps, and dominated by tools
already in the repo.** Key findings, all evidence-backed:
- **Cascade inversion (fatal as stated).** The build places component CSS *between*
  `base.elements` and `base.modifiers` on purpose so modifiers win by source order
  (`tools/build-css.js`); `@layer` is inert. "Base first, components after" reverses it →
  silent, deck-wide equal-specificity regressions.
- **Components aren't self-contained.** 112 `section.<name>` rules live in the *base* tiers
  (`base.modifiers.css` etc.) plus shared family sheets (`_chart-family.css`, `qr-general.css`).
  "Load base + the component's file" renders charts/QR/many components unstyled. Correct
  pruning must be **selector-match-driven** (the `player-prune.js`/`snapshot-cache.js` pattern),
  not file/name-driven.
- **Raw files aren't renderable** without the render-time `packTheme` scoping (`:root`
  relocation, `div.lattice>section`) — they'd need pre-packing at build.
- **gzip is the wrong axis** for the preview: the `srcdoc` CSS is built in-memory and never
  fetched, so minification is a ~10–20% *parse* win (not the 4× the gz figure implies), and
  splitting into N files *adds* mobile round-trips + FOUC and loses ~28% cross-file compression.
- **Win ceiling ~2×, not 5–10×.** Against the already-minified 63KB-gz sheet, a composed sheet
  is ~30–35KB gz over an irreducible ~27KB-gz base floor — and selector-level critical-CSS
  pruning (already built) beats file-composition on the same axis (it prunes *within* base too,
  hitting ~15KB gz for a slide).
- **Export ROI ≈ 0** (rasterizes; CSS bytes don't ship) — confirmed; keep the minified monolith
  there.

**Resolution (owner-directed).** Do NOT build per-component dynamic loading. The measured
585ms write-regime reparse is the only remaining CSS target and it's rare; if/when it's worth
attacking, the sanctioned path is the **build-time, docs-side selector-prune of `out.css`** via
the existing `player-prune.js` kernel (one sheet, one parse, order preserved, no export change),
optionally serving theme/mode/size switches from an adopted pre-pruned stylesheet
(snapshot-cache CSSOM pattern). Higher-leverage cold-start work lives in the JS bundle (B④
preload runtime, B⑤ lazy-split transforms), where gzip actually pays.

**Correction to B①'s premise (found while scoping it).** The engine map showed the
PDF/PPTX/PNG export path (`lattice-emulator.js`) **discards `render().css`** — it inlines
the full disk `lattice.css` and *rasterizes*, so no CSS bytes ship in those artifacts, and
the HTML player already prunes its own copy. The **only** consumer of `render().css` is the
live browser preview. So engine-side CSS scoping of `render().css` does **not** change any
exported artifact's bytes (no export sign-off gate fires) — and, post-B③, its remaining win
is narrower than first framed: it helps theme/size/mode switches (full-writes) and the
Playground's shell-less cold render, not the warm edit the patch path already made ~2ms.
Deferred by owner in favor of metrics honesty (C①); a trusted selector-prune kernel already
exists (`lib/export/player-prune.js`) to reuse at **build time** (rule→required-components
tagging + a runtime set-filter, no browser css-tree) when it's picked up.

### D. RENDER — the engine's per-edit cost is ~all redundant CSS recomposition — SHIPPED
The browser-side bench (§C2) exposed the next orange precisely: after the patch path, a warm
edit's FRAME is ~2ms but its **RENDER (engine) was ~140ms at 4×** — the biggest cost left, and
the thing the 140ms debounce exists to hide. Profiling the `stats` sub-buckets in the real
Studio showed **`cssMs` = 126 of the 136ms** — i.e. RENDER was **92% CSS composition**. Root
cause: `ThemeStore.cssFor(name, size)` (`lib/engine/themes.js`) re-resolved theme imports and
re-packed the ~1MB base into a ~560KB sheet **on every render, uncached** (~26ms/1× / ~104ms/4×)
— and on a *patch* edit that recomposed sheet is thrown away (the patch only swaps the body).
`cssFor` is a **pure function of (registered themes, name, size)**, and a live editing host calls
it with the SAME (theme, size) on every keystroke, so the recomposition was pure waste.
**Fix: memoize `cssFor` by `${name} ${size}`**, cleared on any `add()` (theme registration is a
setup-time event, so wholesale clear costs nothing). Output is **byte-identical** (verified) → no
export change, no sign-off. **Measured (production `dist`, CPU 4×, frame-bench, before→after):**

| needle | before | after |
|---|---|---|
| RENDER (engine) | 141ms | **9.3ms** (−15×) |
| TOTAL patch (whole edit→paint) | 147ms | **16.6ms** (−9×) |

The engine bench (`npm run bench`, one render per deck) is a poor witness here — its warm loop
would report cache-hit speed and hide a cold-compose regression — so that tier now **clears the
memo per timed render** to keep measuring true cold per-render cost (unchanged; the CLI/export
one-shot doesn't benefit and mustn't look like it does). The interactive win is the frame-bench's
to report. Note the engine bundle is a **committed artifact** (`docs/public/playground/lattice-playground.js`,
built by `tools/build-playground.js`) that the docs build only *stages* — a `lib/engine` change is
invisible to the preview until that bundle is rebuilt (a real gotcha hit while measuring this).

### Explicitly *not* the plan
A faster parser, an AST, look-ahead — these target `RENDER 19ms` / `39ms/58 slides`,
already green. Per-slide engine caching is redundant with the DOM patch path. Nothing
here needs them. (Recorded so the option is closed with a reason, not forgotten. The §D
memoization is NOT per-slide caching — it caches the theme→CSS composition, which is
per-(theme,size) and identical across every slide of every deck.)

---

## Verification contract
Every change reports before/after **against the production build**: engine via
`npm run bench`; FRAME via the new browser-side bench at 1×/4× throttle; LCP/FCP via a
real Lighthouse-mobile run on the built docs. No needle is called "good" without an
artifact from the surface it names (HARD RULE #23).

---

## Follow-up (2026-07-20) — the shell's silent-null failure mode, fixed + gated

Front A (the SSG instant-shell) shipped with a resilience contract: `renderFirstSlideShell`
swallows any failure and returns null, so a broken engine load never breaks the docs build.
That resilience hid a real bug. The shell generator loaded the owned engine via a dynamic
`import()`, which Vite's dev SSR module runner re-transforms — and the engine's CommonJS core
(`lib/core/*`) then threw `require is not defined`. So in local `astro dev` the shell + the
returning-visitor snapshot-replay were **entirely absent** (reload → blank preview until the
island hydrated), invisibly. `astro build` happened to load the engine via the native Node
loader, so production was fine — which is exactly why it went unnoticed: the feature could
never be exercised locally, and CI was green.

Two fixes: (1) load the engine through a native `createRequire` so the **same path works in
dev and build**, and log a genuine render failure LOUDLY instead of swallowing it; (2) a
`check:studio-shell` gate (chained into the docs `build`) that **fails the build** if the
shipped `dist/studio/index.html` lost its shell scaffold — so a silent null can never ship a
blank-on-reload Studio again. Lesson: a "resilient, never a build-breaker" enhancement needs a
build-time assertion that it actually shipped, or its degradation is invisible.

**Update (2026-07-20, same day):** the new `check:studio-shell` gate immediately earned its
keep — it went red on the PR's docs-preview build with `Cannot find module 'markdown-it'`
(require stack: `lib/core/bake-splits.js`). Root cause: the docs *deploy* (`docs.yml`) and
*PR-preview* (`docs-preview.yml`) workflows ran `npm ci` only inside `docs/`, so the engine's
ROOT deps were never installed and `renderFirstSlideShell` returned null on **every deploy** —
the deployed studio has been shipping shell-less (reload → blank) the whole time. It only
looked fine locally (and in `ci.yml`'s `docs-build`, which installs root deps for the cadenza
workspace link) because a full checkout has the root deps. Fixed by installing root deps before
the docs build in both workflows. So the original "reload shows blank" report was NOT merely a
stale deploy — it was a genuine, long-standing deploy breakage the silent `catch` had hidden,
exactly the failure mode the loud-log + gate were added to surface.
