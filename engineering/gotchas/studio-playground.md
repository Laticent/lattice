# Gotchas — The Studio and the Playground (docs-site app surfaces)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## The preview `<iframe>` — trap catalog (read this first: surfaces × workarounds)

Every live preview is a **same-origin, un-sandboxed `srcdoc` iframe** — load-bearing
for export fidelity + the untrusted-content security boundary (why:
`engineering/decisions/2026-07-02-preview-iframe-vs-shadow-dom.md`). It charges a
recurring "tax": a class of **iOS-Safari / WebKit-only** bugs that **headless
Chromium — every CI gate — cannot reproduce** (it handles `foreignObject`, delivers
iframe touch, and re-resolves `cqi` under `zoom`; real iOS does none of these). So
"CI green" is NOT verification of preview behavior on a device (HARD RULE #23). This
is the index; each row names its detailed entry as `§ "…"`. Those entries are spread
across several topic files (this one, `browser-engine.md`, `docs-site.md`,
`lattice-internals.md`, `overflow.md`, `fonts.md`), so find one by grepping its
title: `grep -rn '<phrase>' engineering/gotchas/`. Every fragment of a `§` phrase is
a literal substring of the heading it names (`…` marks an elision between fragments),
so the grep hits — if you add a row, keep it that way rather than paraphrasing. A `§`
that FOLLOWS a document name points at a section of that document, not at an entry.

**The preview builders** (`SANCTIONED_PREVIEW_BUILDERS`, `tools/check-ownership.js`):
`deck-preview.js` (Playground + Studio filmstrip — scales each `<section>`),
`single-slide-render.ts` (Studio — scales the iframe ELEMENT), `presenter-window.js`
(Present + rehearsal stage).
Non-browser render paths (the emulator/PDF export, VS Code marp preview) have their
own traps, flagged where relevant.

**A. Scaling & layout — the fixed-1280×720-box tax**

| Trap | Surfaces | Workaround |
|---|---|---|
| Section collapses (`container-type:size` won't size from contents) → cqi/cqh layouts render tiny + jump | all scaled | `slideBox` pins `width/height` before FIT scales (§ "Playground math … renders tiny") |
| **`cqi`/`cqh` COLLAPSE under CSS `zoom` on iOS** (poster → fragment, text → one word/line) | any scaled | **NEVER `zoom` — keep `transform: scale()`** (§ "Preview slides collapse … CSS `zoom`"; decision doc `2026-07-02-preview-scale-zoom.md`, REJECTED) |
| `:root` cqi tokens don't relocate onto `section` on mobile WebKit → spacing collapses | engine playground | delegate CSS packing to marp-core (§ "collapses on mobile WebKit") |
| **A section-own `cq*` resolves against the ICB = the HOST VIEWPORT** → the slide's own padding/gaps track the preview pane, and the filmstrip and the Studio disagree about which slides overflow | filmstrip vs single-slide hosts | anchor to the slide: `calc(var(--_sec-1cqi, 1cqi) * N)` / `--_sec-1cqh` (§ "The Playground and the Studio disagree about which slides overflow"; gated by `checkSectionCqAnchoring`) |
| **A transform-scaled section makes `getBoundingClientRect()` disagree with `scrollHeight`** → measured overflow shrinks with the pane's scale | any scaled | the probe normalizes to layout px (rect ÷ offsetHeight); never compare a rect delta to a scroll dim raw (§ same entry) |
| Scaled `foreignObject` breaks CSS counters / cqi / mask (WebKit) → "00", overlaps, dropped marks | any `inlineSVG` path | render `inlineSVG:false` plain sections (§ "renders broken in mobile Safari/WebKit") |
| 4K decks render oversized / cropped | docs-site, VS Code | `GEOM` globals + fixed-box FIT scale (§ "4K decks oversized"; "HD size inside 4K slides") |
| **Pane-splitter drag over the preview** — the iframe swallows `pointermove` mid-drag, and every drag frame that resizes the iframe re-runs the FIT agent per section (a 60Hz reflow storm on large decks); a pane expanded from a 0-width collapse hits the FIT bail like the mobile-tab reveal | Playground + Studio (`ui/split.tsx`) | `setPointerCapture` on the handle (`lostpointercapture` = authoritative end-of-drag) + `[data-split-dragging] iframe { pointer-events: none }` belt; the parent calls `__latticeFitSuspend()` during drag and `__latticeFitResume()` (one fit) on release; expands re-fit via the proven reveal path + `onFrameLoad`; renders DEFER while the preview is collapsed (decision `2026-07-02-resizable-editor-preview-panes.md`) |

**B. Interaction — touch / tap / scroll (iOS Safari)**

| Trap | Surfaces | Workaround |
|---|---|---|
| iOS won't deliver a touch **INTO** a transform-scaled iframe | any scaled | **parent-hosted capture surface** + `elementsFromPoint` mapping (undo scale with math, not event delivery) — `debug-overlay.js`; decision `2026-07-01-debug-bounding-boxes.md` |
| `position:fixed` doesn't track an iframe's **internal** scroll on iOS → overlay strands | filmstrip | `position:absolute` at **document coordinates** (`getBoundingClientRect + scrollY`) so it scrolls with content |
| Tapping an in-slide external `<a href>` **navigates the frame → blank** (frame-blocked site) | filmstrip (Playground + Studio) | preview-only **link guard** (`linkGuardAgent`) opens `http(s)` taps in a real top-level tab (§ "Tapping an in-slide link blanks") |
| Preview won't scroll after opening a modal sheet on iOS | Playground | make preview-side sheets **non-modal** (§ "won't scroll after … settings sheet") |
| Focusing a **sub-16px text control auto-zooms the whole page** on iOS | any standalone page | global coarse-pointer ≥16px net in `landing.css` + per-CodeMirror-theme bump (§ "Tapping an input zooms the page on iOS") |

**C. Document / realm / content — the #22 boundary**

| Trap | Surfaces | Workaround |
|---|---|---|
| **Live iframe embeds (video playback, arbitrary HTML) are stripped from slide HTML** | all | `sanitizeSlideHtml` `FORBID_TAGS` (`iframe`/`object`/`embed`) + the DSL gate — **BY DESIGN** (HARD RULE #22). You can NEVER put a live embed inside a slide. **To play video anyway → mount the player in the PARENT, over the poster** (`docs/src/playground/video-overlay.js`, `createVideoOverlay`): the in-iframe link guard calls `window.__videoPlay(poster)`, the parent builds an **allow-listed** provider embed (`embedSrc` — nocookie URL from the parsed video id ONLY, never the raw href) and positions a real `<iframe>` player over the poster's mapped rect. Sidesteps #22 (player isn't slide HTML → never sanitized), the iOS scaled-iframe touch trap (player is unscaled parent DOM — works over the scaled filmstrip, no unscaled-Present surface needed), and nested-iframe (no embed inside the srcdoc). Export keeps the static poster. Same parent-hosted pattern as debug-overlay / chart-interact. |
| `@font-face` `@import` order in the srcdoc drops the vendored sketch faces | filmstrip hosts | register the vendored faces in the iframe directly (§ "shows hand-body decks in a system sans") |
| Reusing one iframe via `document.write` strands window state | any embedder | use `iframe.srcdoc` (a fresh browsing context per write) |
| A new preview builder that skips `sanitizeSlideHtml` | all | run it before injecting (gate: § "not a sanctioned preview builder") |

**D. Staleness / loading** — previews 404 the engine CSS/runtime, or serve a STALE
200 bundle: re-stage/rebuild (§§ "previews 404 on the engine"; "serves a STALE
engine bundle"). A committed golden mismatch → check staleness FIRST (§ that entry).

**The meta-lesson:** the sandbox's engine (headless Chromium) is precisely the one
engine that can't surface most of the above. Drive the **real** surface on the
**real** device; when iOS can't be reached from here, say so and mark it UNVERIFIED —
never turn "passed in headless" into "works on iOS."

## Playground/specimen previews 404 on the engine CSS + runtime

- **Symptom:** On the *deployed* docs site (slidewright.github.io/lattice),
  every live preview — the Playground page and every component-page
  specimen — fails with a red status like `theme lattice (404)`. The
  rendered page references `…/playground/themes/lattice.css` and
  `…/playground/lattice-runtime.js` (UNVERSIONED), and both 404. Yet the
  deploy succeeded and the build artifact *does* contain the assets, under
  `playground/v/<hash>/themes/…`. Works fine in `astro dev` locally.
- **Cause:** `docs/src/playground/asset-version.mjs` discovers the staged
  `v/<hash>/` dir to build cache-busted URLs. It derived the lookup path
  from `import.meta.url`. Astro/Vite **bundles** that module for the
  production SSR build and relocates it, so the `import.meta.url`-relative
  path no longer points at `docs/src/playground/`. `readdirSync` throws,
  the `catch` swallows it, `assetVersion()` returns `''`, and `assetBase()`
  falls back to the bare `playground/` prefix. But sync only ever writes
  the *versioned* tree (`sync-playground-assets.mjs`), so the unversioned
  fallback URLs point at files that don't exist → 404. `astro dev` doesn't
  bundle frontmatter modules, so `import.meta.url` stays correct there —
  the failure is build-only, which is why it never showed up locally.
- **Fix:** Anchor the lookup to the **project root** via `process.cwd()`
  (the `docs/` dir under both `astro build` and `astro dev`, and any
  `docs/`-scoped npm script), which survives bundling. The
  `import.meta.url` path is kept as a belt-and-braces fallback. Verify by
  inspecting built HTML: `grep themeBase dist/components/<bucket>/<name>/index.html`
  must show `playground/v/<hash>/themes/`, not the bare `playground/themes/`.
  `assetBase()` now also **throws during a production build** (`import.meta.env.PROD`)
  when no hash resolves — so a future regression fails the deploy loudly instead
  of silently emitting the unversioned 404 URLs. `astro dev` and bare Node
  imports still degrade to the unversioned base.
- **Removable when:** Never silently — if the cache-bust scheme is replaced
  by a generated importable version constant (Vite would inline it, no fs
  read), this whole class of path-resolution failure goes away.
- **Commit:** `fix(docs): resolve the playground asset-version dir from the
  project root, not import.meta.url`.

## Playground preview serves a STALE engine bundle (a 200, not a 404)

- **Symptom:** In `astro dev`, after you rebuild the engine (`npm run build`
  at the repo root, or any edit under `lib/`), the Playground/Studio preview
  renders with the **old** engine: front matter shows up as visible text,
  `finishes:` / deck-class directives don't apply, and `window.LatticePlayground`
  is missing newer API. Nothing 404s — the network tab is all 200s — so it
  looks like *your* code is broken, and you can burn an hour bisecting source
  that's actually correct.
- **Cause:** The preview loads the engine from a **content-hashed** copy at
  `docs/public/playground/v/<hash>/lattice-playground.js`, staged by
  `sync-playground-assets.mjs` (`npm run sync:playground`, which `npm run dev`
  runs as a `predev` step). When you start the server via the **bin directly**
  (`./node_modules/.bin/astro dev` — the documented workaround for
  `astro: not found`), that predev step is skipped, and rebuilding the engine
  afterward updates `dist/` but **not** the staged `v/<hash>/` copy. The page
  keeps serving the previously-staged bundle: a valid file (200), just stale.
  This is the sibling of "Playground/specimen previews 404…" above — that one
  is the *deploy-time, unversioned-URL* failure; this is the *dev-time,
  stale-versioned-copy* failure.
- **Mitigation:** After rebuilding anything under `lib/` (or running
  `npm run build`), re-stage before reloading: `node
  docs/scripts/sync-playground-assets.mjs` (or `cd docs && npm run
  sync:playground`). **Confirm stale-bundle vs real code-bug** without
  bisecting source: re-stage, hard-reload, and see if the symptom clears — if
  it does, it was the served copy, not your code. In-browser, the preview's
  `window.LatticePlayground.render(md, 'indaco')` reflects the *loaded* bundle,
  so its output changing only after a re-stage is the tell. (Don't reach for
  `lib/engine/index.js` as a Node oracle — it's the EXPERIMENTAL P1 core, not a
  shipping render path; see HARD RULE 1's three paths.)
- **Triggered by:** Editing the engine, then previewing via the directly-invoked
  `astro dev` bin (which skips `predev` sync). `npm run dev` would have re-synced.
- **Removable when:** Never, while the preview loads a content-hashed staged
  copy rather than importing `dist/` live — the staging step is the contract.



- **Symptom:** An agent concludes a web-UI change (the Studio, the Playground,
  landing) is "unverifiable in this headless environment" and hands off to a
  desktop session for the visual check. **This is wrong** — the sandbox can
  build, run, and screenshot the Astro site.
- **Cause:** False assumption. The sandbox has Node, the puppeteer-cached
  Chromium (used for the owned engine's PDF rendering), and can serve `astro dev` on
  localhost. The visual loop is: serve → `tools/screenshot.js <url> <png>` →
  view the PNG with the Read tool (renders inline) or `SendUserFile`.
- **Mitigation:** Documented as a first-class loop in
  `engineering/development.md` § "Previewing the docs site (Astro) +
  screenshots" and summarized in `CLAUDE.md` § "You CAN see the web app".
  The reusable tool is `tools/screenshot.js`.
- **Triggered by:** Any change to `docs/src/**` you want to eyeball.
- **Removable when:** Never — this is the standing capability, not a
  workaround.

## The editor|preview divider snaps to the middle a moment after the page loads

- **Symptom:** you drag the Studio's divider, reload, and the divider appears where
  you left it — then jumps to roughly the middle, then jumps back. Reads as the
  pre-paint placeholder not knowing where the splitter was.
- **Why (and why the obvious reading is wrong):** the placeholder knows exactly. It
  reads the persisted split in `studio.astro`'s pre-paint seed and draws it correctly.
  It is the APP that was late. `StudioShell` rendered its panels at a hardcoded
  46/54, and `useResizableSplit` applied the saved layout in an effect deferred by a
  double `requestAnimationFrame` — frames that queue behind the ~505KB engine fetch.
  Measured at 1440x900 with the split at editor 25%: the shell had the divider at
  360.75px from t=320ms, the app mounted at 662/777 at t=1467ms, the shell was
  dismissed at t=2896ms, and the saved layout landed at t=3317ms. So the corrected
  paint arrived ~400ms AFTER the correct placeholder was taken away.
- **Fix (shipped):** the saved layout is read during the first render and handed to
  `react-resizable-panels` as the group's `defaultLayout`, so it initializes at the
  remembered widths and the default share is never laid out. The consumer declares its
  `clientOnlyPanelIds` because the only runtime source of the real ids — the mounted
  group — is one mount too late. Pinned by the `@smoke` case in
  `docs/e2e/studio-instant-shell.spec.ts` that asserts the pane's whole width log is
  one entry.
- **Do NOT copy that seed to a splitter on a page that server-renders.**
  `getPanelStyles` reads `defaultLayout` during RENDER, so on a hydrated island it is a
  style mismatch React 19 refuses to patch ("this won't be patched up"): the DOM keeps
  the server's `flex-basis` forever and the pane stops measuring the share it reports.
  The give-away is `aria-valuenow` staying right while the pixels go wrong. The
  Playground (`client:load`) therefore restores post-mount and only the Studio
  (`client:only`) is seeded.
- **The Playground's version of the same disease, and its different cure:** that
  island server-renders, so before hydration its panes carry no `flex-grow` and an
  inline `flex-basis:45` — unitless, therefore invalid, therefore dropped. The panes
  size to CONTENT and leave the row empty (measured: 123px + 300px = 29% of the row,
  for ~1s on a reload). Because the inline value is invalid and the inline grow is
  absent, a STYLESHEET can own that window — which is what the 2026-07-19 migration
  note wrongly assumed was impossible when it retired the old CSS-var seed. The seed
  is back (`playground.astro` + the `--pg-split-a/b` rules in `playground.css`), and
  that, not `defaultLayout`, is how you give a hydrated splitter a correct first paint.

## The Playground's preview pane is empty for seconds after a reload

- **Symptom:** reload the Playground and the preview half is a blank void until the
  engine finishes loading, then a slide appears. The Studio never does this.
- **Why:** the Playground DOES have a pre-paint snapshot replay (`.pg-ssr-shell`,
  gated on `data-pg-shell="on"`), and it was dead. Its gate compared the cached
  snapshot's `srcHash` against `fp(lattice-docs-pg-source)` — the visitor's DRAFT,
  which is only written once they type in the editor. Anyone who just picks
  components has no draft, so the comparison was the snapshot's real hash against the
  hash of the empty string. Measured: every other clause (`v`, palette, mode, html,
  css) passed and this one failed `96ae8e9b` vs `1505`.
- **How to tell:** watch `document.documentElement.getAttribute('data-pg-shell')`
  across a reload. If it is never `"on"`, the replay was rejected — evaluate the gate's
  clauses one at a time rather than guessing which.
- **The trap that hid it:** every existing test waited for the LIVE filmstrip, which
  arrives either way. A silent pre-paint mechanism needs a test that asserts the
  MECHANISM ran, not that the content eventually appeared.
- **Fix (shipped):** with no draft, the identity of what will render is
  `lattice-docs-pg-inserted-hash` — which the same seed already uses for its `pristine`
  test. Pinned by "a reload replays the cached slide before the engine renders".
- **Triggered by:** #1553.

- **The general rule:** the shell and the app share boot state through the same
  storage, so they agree at rest; they disagree in the FIRST SECOND whenever one
  reads before paint and the other corrects after it. If you add shared boot state,
  make the app read it at render, not in an effect.
- **Triggered by:** `engineering/decisions/2026-08-10-shell-app-boot-state-sharing.md`.

## The Playground's cached slide jumps when the live preview takes over

- **Symptom:** a reload shows a real slide almost immediately (the instant shell doing
  its job), and then, three or four seconds later, that slide shrinks and shifts as the
  engine's filmstrip appears. Nothing is broken afterwards — it just moved.
- **Why:** the two halves each derived their own geometry. The replay centered the slide
  in the preview pane less a 16px padding; the live filmstrip centers it inside a srcdoc
  whose `html,body{padding:18px}` applies to BOTH elements — so the usable width is
  `frameW - 72`, not `- 32` — with `justify-content: safe center` over a FIT-clamped deck
  height. Measured at 1194x834: cached `[354,261,824x464]`, live `[374,290,784x441]`.
- **Do NOT fix it by re-deriving the filmstrip's chain in the replay.** That is a second
  model of a layout the srcdoc's own CSS owns, and it drifts the moment either padding
  changes — the exact failure the Studio shell's six hand-measured constants keep having.
- **Fix (shipped):** the app MEASURES its own live slide when it captures the snapshot and
  stores the rect in the replay box's coordinates (`snap.fit`, plus the box size it was
  measured in, snapshot `v: 2`); the replay places the cached slide exactly there. The
  hand-off is then a cross-fade in place. If the filmstrip's geometry changes, the next
  capture records it and nothing in the replay needs to know.
- **A measurement is valid ONLY for the box it was taken in.** The first draft rescaled the
  stored rect into a differently-sized pane and was measurably 5–18px out, because the
  filmstrip centers at `18 + (boxH-h)/2` — the srcdoc's html padding sits OUTSIDE the box it
  centers in, so a slack ratio cannot reproduce it. The replay now refuses when the pane
  differs from the captured one, and a ResizeObserver withdraws the shell if the pane moves
  underneath it. A blank that never moves beats a slide that jumps.
- **The general rule:** when the pre-paint side needs a number a THIRD party decides, have
  the app measure what happened and publish it — don't mirror the third party's arithmetic.
- **A capture taken with the preview COLLAPSED cannot poison the next load, and it is worth
  knowing why (#1590).** Two independent guards, either of which alone refuses: the box the
  fit is measured against (`.pg-preview-wrap`) sits inside the `.pg-pane-inner` a collapsed
  pane hides, so it is 0x0 — and the preview iframe has no layout under a `display:none`
  ancestor, so the slide inside it is 0x0 too. `captureFirstSectionFromFrame` returns null,
  `savePlaygroundSnapshot` is never reached, and the PREVIOUS good snapshot stays. Driven on
  the real surface (collapse → render → leave-capture → expand → reload): the stored `ts` is
  unchanged and the replay lands on the live slide within 0.05px. If you ever relax
  `measureFit`'s zero-box check, this is what you are removing.
- **Triggered by:** #1563, #1590.

## The Playground's Explore layout arrives a second after the page does

- **Symptom:** open the Playground with nothing saved (or with Explore remembered) and the
  page paints as the two-pane EDITOR — markdown on the left, preview on the right — then
  about a second later the editor pane vanishes, the deck goes full width, the pane labels
  disappear and a walk bar drops in at the bottom.
- **Why:** every one of those is `body[data-view='read']`, and the app set that attribute in
  a mount effect. Before it ran, the CSS saw no attribute and drew the Edit layout.
  Measured at 1194x834, CPU 6x: editor pane 337px at t=487ms and gone at t=1349ms; preview
  856 → 1194 → 1194x619.
- **Fix (shipped):** the pre-paint script resolves the boot view — it already computed the
  same answer to gate the snapshot replay — and publishes `<html data-pg-view>`;
  `playground.css` reads it through `:is(:root[data-pg-view='read'], body[data-view='read'])`
  aliases, and `adoptBootSeed` moves ownership to the app in one step at mount.
- **Both attributes must never be live at once.** They drive the same rules, so a stale seed
  beside a different body value hides OPPOSITE panes on the phone and leaves the surface
  blank. Setting the body attribute and removing the seed is therefore one function, not two
  effects.
- **The walk bar used to arrive late and take its band, and a RESERVE for it was built and
  withdrawn — don't rebuild that.** The only height available to reserve from is the one the
  last session measured (the caption of the slide it ended on) while the band belongs to the
  next boot's FIRST slide: 127px reserved against a 184px bar on an ordinary flow, 71px the
  other way on a stale deep link, and — keyed on the bar's absence with no time bound — a
  permanent dead band whenever the plan fetch 404s.
- **What fixed it instead (#1588): stop reserving a box and just have the box.** In Explore
  the walk bar is CHROME, not walk state, so it is rendered unconditionally — in the SSR'd
  markup, before any plan exists — with only its contents waiting for the network (steppers
  disabled, position empty). Then nothing is allowed to change its height: the row is
  `nowrap`, EVERY item in it except `.next` is rigid, the position holds a fixed slot, and the
  caption box is exactly `--pg-walk-cap-lines` lines whatever it holds. A notice shares that
  line-box rather than adding one.
- **`flex-wrap: nowrap` is not enough on its own, and the near-miss is worth knowing.** It
  stops the ROW wrapping; it does nothing about text wrapping INSIDE a shrinkable item. With
  only `.next` hardened, a long cross-component label squeezed Prev until "‹ Prev" broke onto
  two lines and the bar grew 20.8px — at ≤390px, mid-read, at exactly the moment the bar is
  supposed to be still. A SHORT label does not trip it (the threshold is ≈220px), which is how
  the first verification cleared it.
- **The bar is hidden by DEFAULT and Explore reveals it — not hidden in Edit.** Its visibility
  hangs on the pre-paint seed, and the seed's outer `try` opens with a `localStorage` read, so
  storage denied means no boot view at all. Defaulting to shown put a 93px dead nav in EDIT
  for ~1.5s on that path.
- **If you touch the walk bar, its height is the invariant.** Anything content-shaped you add
  — a second notice line, a wrapping row, an un-clamped caption, a button that can shrink —
  puts the jump back, and the e2e case that catches it is the Explore one in
  `playground-first-paint.spec.ts` (which tracks `previewPane` and `walkBar` again precisely
  because of this). Test it with the LONGEST cross-component label, not the first one you hit.
- **`aria-live` has to arrive WITH its value.** `.pg-walk-pos` is SSR'd empty; a live region
  already in the tree that goes from nothing to "1 / 8" is a change, and assistive tech
  announces it. The attribute is set only once there is a position, so the region reads as
  arriving populated. A pending state has to be pending to AT too.
- **Triggered by:** #1563, #1588.

## The Playground's divider is in one place before hydration and another after

- **Symptom:** reload the Playground on a window narrower than the one you last sized it in
  and the editor|preview divider paints in one place, then jumps a few tens of pixels as the
  island hydrates. Often accompanied by the instant shell simply not appearing.
- **Why:** the saved layout is a pair of PERCENTAGES; the panes' minimums are PIXELS
  (`PG_SPLIT_MIN` — editor 280, preview 320). A share that clears its minimum at the window it
  was saved in can fall below it at a narrower one. The library clamps at hydration; the
  pre-paint seed spent the raw share. Measured: a real drag to a 25% preview at 1920, reloaded
  at 1194, painted **298.3px** and settled at **320px**. The missing shell is downstream — the
  cached slide's rect was measured in a box that changed size, so the box-match gate declined.
- **Fix (shipped, #1589):** the seed emits `min-width` rules into `<head>`, scoped to the
  viewport band where the library actually clamps, and `data-pg-split-seed` gates them.
- **RESTORING IS NOT CLAMPING, and this is the trap.** `react-resizable-panels` resolves an
  under-minimum size in TWO branches (`Z()` in its bundle): a `collapsible` pane restored below
  the MIDPOINT of `collapsedSize` and `minSize` snaps to the rail; only above it does it clamp
  to the minimum. Modeling the clamp alone painted a 320px preview where the app then handed
  off to a 28px rail — 292px wrong, held ~1.3s, WORSE than the defect it fixed. `PG_SPLIT_RAIL`
  and `PG_SPLIT_SNAP_MIDPOINT` exist so the seed can express both branches; below the midpoint
  it emits nothing and the raw share paints. `Z()` is the RESTORE path — a drag goes through
  `le()`'s own half-delta arithmetic, so don't reuse the midpoint to predict a drag. The Studio's `preview-rect.ts` has carried this
  rule since #1553 ("clamping alone painted a 300px preview where the app handed off to a 46px
  rail") — read it before writing a pre-paint side for any splitter here.
- **Do NOT reach for the sessionStorage collapse marker to detect this.** It was tried: the
  marker is per-tab, the sub-minimum SHARE is in `localStorage` and permanent, so a new tab
  takes the clamp branch and breaks. *A guard is only as good as the shortest-lived thing it
  reads.*
- **`!important` is load-bearing there, and setting the style on the element is not the
  shortcut it looks like.** The SSR'd panel wrapper carries `min-width:0` INLINE, so a plain
  stylesheet rule loses. Writing `el.style.minWidth` instead would win the cascade and then
  never be undone: React's prop record would still read `0`, so the library would never write
  over it, and the clamp would outlive the seed for the life of the page.
- **The clamp must die with the seed.** `adoptBootSeed` drops `data-pg-split-seed` alongside
  the view/pane attributes. A surviving `min-width:320px` would stop a collapsed preview from
  ever reaching its 28px rail — the grow vars are safe to leave only because the library's
  inline `flex-grow` outranks them, and `min-width` has no such counterpart.
- **Triggered by:** #1589, from the red-team pass on #1563/#1581.

## A header control shows nothing (or the wrong thing) for a second after every page load

- **Symptom:** the theme `<select>` in the site header is empty on load and fills in with the
  persisted palette a second or more later; the light/dark button shows the Monitor
  ("System") icon at someone who pinned dark, then swaps. Every page of the site.
- **Why (two causes, and the second is the surprising one):** the control read its state in a
  mount effect, so it had nothing to say until the `client:idle` island hydrated — under load
  that was 1.9s to 5.1s. And radix's `SelectValue` with no children renders NOTHING: the
  selected item's text is portaled in by `SelectItemText`, which only exists once a layout
  effect has built the closed content's DocumentFragment. So the trigger was empty in the SSR
  markup no matter what the value was.
- **Fix (shipped, #1592):** both controls are PAINTED FROM `<html>` ATTRIBUTES. PaletteControls
  renders every palette's label and all three mode icons; one CSS rule per palette (and three
  for the stops) shows the one in force. A pre-paint seed in `SiteHeader.astro` publishes
  `data-palette` and `data-mode-pref`, and `PaletteControls` reads them in its first render so
  its own state agrees.
- **The seed sits ABOVE the header markup, and that is the second half of the fix.** A first
  draft patched the trigger's text right AFTER the markup instead. A per-frame sampler caught
  the un-seeded state about one run in three ("Indaco"/System at t=114ms, corrected at
  t=177ms): a script that has to beat the first paint of markup it sits below is a race.
  Setting an attribute the markup has not been parsed against yet is not.
- **The per-palette rules are injected by that script, not shipped as a `<style>` in the
  component.** A `<style set:html>` in an `.astro` file is not bundled into the head — Astro
  emits it at the END of the body, i.e. after the header it styles, which reopens the same
  window (measured: no label at all from t≈165ms to t≈365ms). Appending the sheet to `<head>`
  from a script that runs before the header is parsed does not have that problem.
- **`data-mode` cannot stand in for `data-mode-pref`.** System-resolved-dark and pinned-dark
  are the same resolved mode and a different STOP, and the icon names the stop.
- **The mode icon is three icons with CSS picking one, and that is not decoration.** The
  server cannot know the stop, so React choosing would put Monitor in the HTML and Moon in
  the client's first render — a hydration mismatch React 19 does not patch. Rendering the
  same three on both sides moves the choice to an attribute the seed has already written.
- **A seed that NORMALIZES a bad stored value must also CLEAR it.** The first version rewrote
  `<html data-palette>` to a shipped palette and left the key alone; `syncFromStorage` re-reads
  the key at mount with no validation and stamped it straight back, so the page painted the
  fallback and then flipped to a theme whose CSS 404s — a flash the seed itself introduced.
  `playground.astro` has always removed the key; the site-wide surfaces had nothing that did.
- **Making one control truthful can make the one beside it a liar.** The command palette sets the
  palette directly and `storage` only fires cross-tab, so `PaletteControls`' state never moved:
  once the trigger read correctly, the select's LIST still ticked the old palette — and
  re-picking the item radix believes is selected fires no `onValueChange`, so it was a dead
  control. `site-chrome` dispatches `CHROME_CHANGE_EVENT` on a same-tab set and the control
  listens. If you add another writer of palette/mode, go through `site-chrome`.
- **If you add a header control that shows persisted state,** give it the same shape: render
  every possible value, pick one with CSS keyed on an `<html>` attribute, and set that
  attribute above the markup. `site-chrome-first-paint.spec.ts` samples every frame across
  three page families and fails on any second value.
- **A per-frame sampler must know when a control is half-PARSED.** The three mode icons are
  large inline SVGs and the HTML parser yields between them, so a frame can land on a button
  holding two of the three — no icon lit, which reads as a second value for the control and
  fails about one run in eight. That is absence, not a state a person sees: the sampler skips
  a frame whose button does not hold all three, and the case asserts the settled DOM does hold
  all three so the skip cannot hide a real regression.
- **Triggered by:** #1592.

## The Studio counts fewer slides than the deck renders — or an edit destroys a slide

- **Symptom:** the rail shows one slide where the exported PDF has two; the page number skips; a
  caret jump lands on the wrong slide; or — the worst of it — the chat rewrites "slide 1" and the
  deck's SECOND slide vanishes under a green "Applied" tick. All of it on a deck that looks
  perfectly ordinary. The tell is the separator: it is not a bare `---`.

- **Cause:** the engine breaks a slide on **every top-level markdown-it `hr`**
  (`splitOnHr`, `lib/engine/slides.js`). Every caller-side splitter used to derive that set from
  its own regex over `---`, and `/^---$/m` (or `/\r?\n-{3,}\r?\n/`) matches only a bare run of
  exactly three hyphens with nothing after it. Six forms therefore split for the renderer and were
  invisible to the rail, the editor sync, the Coach, the rehearsal planner and the chat edit path
  (measuring found eight, not the four the issue named):

  | written as | engine | the old caller-side splitters |
  |---|---|---|
  | `***` · `___` · `- - -` | 2 slides | 1 |
  | `--- ` (a trailing space) · `---` + tab | 2 slides | 1 |
  | `----` (four or more) | 2 slides | 1 |
  | `  ---` (indented 1–3 spaces) | 2 slides | 1 |

  And in the other direction — where the old splitters cut and the engine does not — a `---`
  directly beneath a line of text is a **setext heading**, and a `---` inside `$$` math, an HTML
  block, an HTML comment or a code fence is masked. Each made the rail offer a slide the deck does
  not render.

- **Fix (shipped, #1271):** `lib/core/slide-boundaries.mjs` is the ONE derivation, and it CALLS THE
  ENGINE'S PARSER — `md.block.parse` on `lib/core/boundary-parser.js`, memoized per source. Every
  caller reads it. If you are writing anything that asks "which slide is this?", **call that
  module** — do not add a regex, and do not write a scanner that imitates markdown-it. The first cut
  of this fix did exactly that and shipped six confirmed wrong answers behind a confidence flag; the
  decision record has the bill.

- **The one rule callers still share:** `splitOnHr` drops its first token group when that group is
  empty, so a body opening with a separator renders N sections from N+1 chunks. `dropLeadingEmpty`
  is that rule, exported once. It keys on the TOKEN stream rather than the text, because "produces
  no tokens" and "is blank" differ — a link reference definition is real source that produces
  neither.

- **There is no "unsure" any more, and that is deliberate.** An interim cut of this fix returned a
  `certain` flag for shapes a hand-written scanner could not settle, and two callers refused when it
  went false. A parse has no undecided answer: an unclosed fence, a half-typed HTML block, a deck
  caught mid-keystroke — each parses exactly as the engine parses it, so the boundaries are right
  rather than admitted-to-be-doubtful. The flag also gave false comfort, reading `true` on all six
  shapes the scanner got wrong.

- **Authoring note:** write separators as a bare `---` with a blank line on each side. Every other
  `hr` form works, but the blank lines are what keep a `---` from being read as the heading
  underline for the line above it — which is a different slide count, not a style preference.

## A `split-panel proof` run is one hue in the Studio, but only when the deck doesn't paginate

- **Symptom:** a leveled deck's `split-panel proof` slides each show their own categorical tint in
  the Playground and the exported PDF, but in the Studio (Present, its overview grid, the editor
  preview) they all paint the SAME hue, always `cat-1`. Add `paginate: true` to the front matter and
  the colors come right — which is the confusing part, because pagination has nothing to do with
  color.

- **Cause:** `cat-N` is **not authored** — the engine assigns it from the slide's ordinal among the
  deck's proof slides (`sequenceProofPanels`, `lib/core/split-panels.js`). The Studio's previews render
  the whole deck and display one section precisely so deck-derived facts resolve (#1265), but that
  costs a whole-deck parse, so it is gated by `needsDeckContext`
  (`docs/src/lib/single-slide-render.ts`). The gate's first cut listed pagination, running-global
  directives, dividers and `glossary: auto` — **not** proof runs. So a proof deck that paginates got
  the deck render (and correct hues) as a side effect, and one that didn't fell back to the lone
  slice, where every proof slide is "the first one".

- **Fix (shipped):** `split-panel proof` is a registered entry in `DECK_DERIVED_FACTS`. If you are
  adding a feature whose rendered value depends on other slides, **add an entry there** — name the
  fact and say why a lone slice can't produce it. The gate is a registry, not a regex chain, so this
  is one place and the tests assert every entry is named, justified and probed.

- **The trap to avoid repeating:** don't key the gate on a *visibility* switch. Pagination is the
  forgiving fact — a page number nobody displays can be wrong invisibly — so "is pagination on?"
  looked like a reasonable proxy for "does this deck need real context". Any fact that renders
  regardless of a toggle (a color, a rail, a glyph) breaks that proxy in plain sight.

- **Guard, and what it actually blocks:** `docs/e2e/proof-run-deck-context.spec.ts` drives the real
  Present overlay on an UN-paginated proof run and reads the painted fill. It fails if the registry
  entry is removed — but it is NOT `@smoke`, so it runs in the nightly suite and **does not block a
  merge**; `ci.yml` keeps `studio-smoke` out of `ci.needs` deliberately. What blocks a merge is the
  docs Vitest job, where `single-slide-render.deck-context.test.ts` pins the expected fact SET by
  name. That pin exists because the registry's other structural assertions iterate the registry, so
  deleting a fact deleted it from the check and the whole suite stayed green — verified against the
  `glossary: auto` entry. Unit tests assert the gate's answer; only the e2e asserts what the reader
  sees, and this bug class has been found twice by bug report, never by a passing unit suite.

## A live preview prints "1" as the page number on every slide

- **Symptom:** a deck with `paginate: true` shows the page number `1` on every slide in a
  preview — most visibly the Studio's Present slide-overview grid, where every tile reads
  "1". Navigating slides doesn't change it. The exported PDF/HTML numbers correctly, and the
  Playground's filmstrip numbers correctly, so it looks like a Studio-only rendering bug.
- **Cause: the engine numbers the DOCUMENT IT IS GIVEN, and the caller gave it one slide.**
  `lattice_directives_apply` (`lib/engine/slides.js`) walks the parsed token stream and does
  `pageNumber += 1` per section, stamping `data-lattice-pagination` with that ordinal and,
  after the walk, the final count as `data-lattice-pagination-total`. It is a position within
  one parse — there is no deck-level state and **no offset parameter** (`render(markdown,
  theme, opts)` takes only `baseUrl` / `stats` / `preview`). So a caller that slices one slide
  out and renders it alone gets a truthful "1 of 1". Nothing downstream is wrong: the
  `section[data-lattice-pagination]::after` pseudo (`lib/engine/css.js`) and the visible
  `<span class="lat-pagination">` both just read what the engine stamped.
- **Fix:** hand the engine the whole deck and DISPLAY one section — `DeckPreview`'s
  `slideIndex` / `renderInto`'s `opts.slideIndex`, which narrows a whole-deck render to the
  one shown slide (`keepOnlySection` in `docs/src/lib/single-slide-render.ts`). The kept
  section carries the ordinal, the total, and its positional `id`, all computed against the
  real deck. The srcdoc still holds a single section, so the frame's CSS parse + runtime
  execution is unchanged — but note the engine parse is now the dominant cost on the PATCH path
  (a warm edit's frame is ~1.8ms), so a **single-entry module-level memo of the last whole-deck
  render** collapses the two interactions that repeat an identical parse: changing the shown
  slide, and the overview grid's N tiles rendering the same deck. Measured on the real Studio at
  4× CPU on a 40-slide deck, navigation is TOTAL 7.1ms p50 (RENDER 0.1ms) against 12.8ms/6.8ms
  before deck context existed. A keystroke misses the memo by construction and pays the full
  parse; that one needs the engine-side incremental render path, not a memo.
- **The trap inside the fix — ONE AUTHORED SLIDE IS NOT ONE SECTION.** `slideIndex` indexes
  the CALLER's authored-slide list; narrowing indexes the ENGINE's sections. They diverge, and
  when they do an index-based lookup paints a slide the author did not select — which is worse
  than a wrong number, because a wrong number is visibly wrong and a wrong slide is plausibly
  wrong. Two confirmed causes, both on decks that ship here: a **1→N expansion** (`_focusSteps`
  clones one slide into a section per step — `examples/focus.md` is 11 authored → 14 sections;
  `split: headings` divides one chunk at every heading — `examples/split-headings.md` is 1 → 7),
  and — until 2026-08-05 — **splitter disagreement**: the engine's `splitOnHr` breaks on ANY
  markdown-it `hr` (`***`, `___`, `- - -`, `--- `, `----`, an indented `---`) while the Studio
  matched only a bare `\n---\n`, so six forms split for the engine and not for the caller.
  **That cause is retired** — the Studio derives boundaries from the engine's own rule
  (`lib/core/slide-boundaries.mjs`, #1271), so the counts agree. The 1→N expansion above
  REMAINS, so the guard is still load-bearing. So a host passes
  `slideCount` and `slideMarkdown` alongside `slideIndex`: narrowing happens only when the
  engine's section count agrees, and otherwise the shown slide is re-rendered alone and
  honestly numbered 1 of 1. **Right slide always; true number only when provably true.**
  Locked by `docs/src/lib/single-slide-render.alignment.test.ts`, which drives the real engine
  and the real splitter over the real example decks — a mocked engine cannot express a 1→N
  expansion, which is exactly the failure mode.
- **Triggered by:** any new preview surface that slices a slide out of a deck before
  rendering. If a host knows a slide's place in a deck, it must pass `slideIndex` **with**
  `slideCount` and `slideMarkdown`; omit all three only for a genuinely standalone slide (a
  landing island, a component specimen), where 1-of-1 is the truth. Note the preview number can still differ from the exported PDF's for a
  portrait/square/story deck: auto-split runs only in `lattice-emulator.js` (the export path,
  `resplitDoc`), never in the browser render, so an export may legitimately have more pages
  than the deck has slides.

## Playground renders broken in mobile Safari/WebKit (counters "00", chart text overlaps, marks drop)

- **Symptom:** On the live docs playground (`/lattice/playground/`) in mobile
  Safari / iOS / any WebKit browser: numbered components (`list principles`,
  `list-criteria`) show `00` for every counter instead of `01 02 03…`; charts
  (`state-chart` etc.) render with giant labels overlapping each other; SVG
  state marks (checklist/verdict-grid/obligation-matrix discs) lose their
  in-disc symbol or show as a clipped half-shape. The SAME deck renders
  perfectly in Chrome, in the exported PDF, in the per-component gallery
  baselines, and in marp-vscode. CI is green throughout.
- **Cause:** Marp's default `inlineSVG` wraps every slide in
  `<svg><foreignObject><section>…` (this is *why* Marp ships a Safari
  `marpit-svg-polyfill`). WebKit cannot reliably lay out HTML inside a *scaled*
  `<foreignObject>`, and the engine leans on exactly the features that degrade
  there: CSS counters (style containment from `container-type` makes WebKit
  drop the increment → value 0 → `decimal-leading-zero` renders "00"),
  container-query units (`container-type` / `cqi` / `cqh` can't resolve a
  container size inside the foreignObject → fall back to the ICB → labels
  balloon and overlap), and CSS `mask` (the `var(--state-mark)` masks on the
  state discs drop). Crucially, **every Lattice regression gate renders via
  headless Chromium** (puppeteer), which handles foreignObject natively, so the
  whole WebKit failure class is invisible to `npm test` / the integration tier.
  The deployed assets being byte-identical to `main` (verify with `md5sum`
  against the live `playground/themes/lattice.css`, `lattice-runtime.js`,
  `lattice-playground.js`) is the tell that it's a render-context bug, not
  staleness.
- **Mitigation:** The playground engine (`lib/playground/index.js`) renders
  with `inlineSVG: false`, so slides are plain `<article class="lattice"><section>`
  HTML with no foreignObject; `writeFrame` in `docs/src/pages/playground.astro`
  scales each fixed-size `<section>` to the iframe width with a CSS `transform`
  (a negative `margin-bottom` collapses the gap the un-scaled box would leave),
  re-fitting on resize + content-height change. The Safari foreignObject
  polyfill is removed (nothing left to polyfill). The PDF/emulator path KEEPS
  `inlineSVG` — fixed-page rendering needs it, and it renders server-side via
  Chromium so it never hit this. Rebuild the bundle: `npm run playground:build`.
- **Triggered by:** Any new component that relies on `container-type`/`cqi`,
  CSS counters, or `mask` — i.e. nearly all of them. The fix is structural (no
  foreignObject) rather than per-feature, so new components inherit it.
- **Removable when:** WebKit gains reliable layout for HTML in a scaled SVG
  `<foreignObject>`. No timeline; don't count on it.

## Playground math (and any cqi/cqh layout) renders tiny + "jumps/rescales"

- **Symptom:** In the docs playground, `math` variants — especially
  `matrix` and `compare` — render shrunk to an unreadable size and visibly
  jump/rescale a few times after the slide first appears. `math stats`
  looks fine. Same source renders correctly in the PDF gallery and on the
  component-page specimens.
- **Cause:** The playground engine renders `inlineSVG:false` (no
  `<svg><foreignObject>` wrapper — see the WebKit entry above), so the
  bare `<section>` must get its box from the host page. But
  `dist/lattice.css` sets `section{container-type:size}`, and **size
  containment refuses to size the box from its contents** — without an
  explicit width/height the section collapses (height→0) and every
  `cqi`/`cqh` the layouts rely on resolves against a broken box. KaTeX-heavy
  variants overflow, and because the KaTeX stylesheet streams in from the
  CDN async, each pass of the `FIT` routine (60/300/1200/2500 ms + every
  ResizeObserver tick) measures a *different* `section.offsetWidth` and
  recomputes `scale(w/sw)` — hence the jumping + tiny render. `stats`
  survives because it's content-light and mostly `em`-driven. This is NOT a
  math-layout bug; the CSS contract and the PDFs are correct.
- **Mitigation:** `docs/src/playground/frame-css.js` is the SINGLE SOURCE OF
  TRUTH for the `.lattice>section{width:1280px;height:720px}` pin (`SLIDE_BOX`)
  and the single-slide wrapper (`SINGLE_SLIDE_FRAME` / `singleSlideFrame(geom)`).
  All `inlineSVG:false` hosts import it — `single-slide-render.ts` (the shared
  hero / restyle / field-card / specimen renderer) calls `singleSlideFrame(geom)`
  directly, `playground.astro` (playground) through the page's JSON data channel
  — so `container-type:size` always gets a definite box and
  the playground `FIT` is deterministic at `scale(w/1280)`. The three used to
  inline the dimensions independently and drifted (the hero pinned the wrapper
  but not `>section`; the playground pinned neither) — which is how this bug
  entered. Any new `inlineSVG:false` host must import from `frame-css.js`, not
  re-type the dimensions.
- **Triggered by:** A new playground/specimen host that renders
  `inlineSVG:false` without importing `frame-css.js`, or any layout leaning on
  `cqi`/`cqh` for sizing.

## Playground preview won't scroll on iOS after opening a settings sheet

- **Symptom:** On the **/playground** — load a
  deck (e.g. the jargon gallery), scroll the preview (fine), open **Galleries** or
  **Deck setup**, change something (e.g. slide size), close the sheet → the preview
  is now frozen. It scrolls again only once focus leaves it (tap elsewhere) or after
  a prolonged delay (10s+). iOS Safari only; desktop Chromium never shows it (faster
  + off-main-thread scrolling), which is why headless wheel tests can't repro it.
- **Cause:** The playground is the React/shadcn surface; its panels are shadcn
  **Sheets** (Radix Dialog), which default to `modal`. A modal Radix dialog engages
  `react-remove-scroll` — it sets `body[data-scroll-locked]` and, crucially on iOS,
  adds non-passive `touchmove` `preventDefault` listeners to block background scroll
  (iOS ignores `overflow:hidden` for touch). On iOS Safari that touch-block lingers
  after the dialog closes until a focus change or a long timeout, freezing the
  preview. The (now removed) vanilla Drawing Board used no Radix dialog and was
  immune — the tell that originally distinguished the two surfaces. Confirmed in Playwright WebKit:
  `body[data-scroll-locked]` was `"1"` while the modal Deck-setup sheet was open.
- **Fix:** Make the playground's preview-side sheets **non-modal** — `modal={false}`
  on the `<Sheet>` Root + `overlay={false}` on `<SheetContent>` (a new opt-out prop
  on the shared `ui/sheet.tsx` primitive; default keeps the modal behavior for
  every other sheet). A live-tool side panel shouldn't lock the page anyway, and
  non-modal lets you watch the preview update as you change front matter. Files:
  `docs/src/components/playground/{DeckSetupSheet,GalleriesSheet}.tsx`,
  `docs/src/components/ui/sheet.tsx`.
- **Don't reintroduce:** any sheet/dialog that overlays a surface the user still
  needs to scroll (the live preview) must be non-modal, or it will scroll-lock iOS.

## The Studio "crashed" and reloaded itself, and nothing was logged anywhere

- **Symptom:** the Studio vanishes and the page comes back fresh, mid-session. The
  console is empty, no error card appeared, no boundary fired, and nothing in
  `ErrorBoundary` / `chunk-load` / `window.onerror` has any record of it. Often
  after a long session, a big deck, or time spent in Present.
- **Cause:** this is not a JavaScript exception, so no in-page handler can see it.
  Either the tab's **renderer process died** (out of memory is by far the most
  common — the Studio holds a live preview iframe, Present's second render surface,
  a Stage window, export workers and on-device model workers at once) or the
  browser **discarded** a backgrounded tab under memory pressure. In both cases the
  page's JS is already gone: `beforeunload`, `pagehide` and every boundary are
  dead, and the reload that follows wipes the console.
- **Fix:** don't go looking in the console — there is nothing there and there never
  will be, because the reload wiped it. Read the crash report instead: the Studio
  records a rolling session record (`docs/src/lib/crash-sentinel.ts`) with the heap
  trajectory, main-thread stalls, every error it saw and the breadcrumb trail.
  **It is at Workspace → General → Crash reports, and nowhere else — nothing
  announces it.** (There used to be a boot toast; it was removed, see the next
  entry.)
  **FIRST CHECK WHETHER RECORDING WAS EVEN ON.** It is **off by default** — the
  same Workspace group carries the switch. If it was off, there is no report and
  there is no way to make one after the fact; turn it on so the NEXT one is
  diagnosable. An empty Crash reports group therefore means one of two different
  things, and the switch is what tells them apart: armed and nothing crashed, or
  never watching. The console IS captured while the page is alive — everything written to
  `console.error` goes into the record with its stack — so an error the app caught,
  logged and degraded around is in the report even though `window.onerror` never
  saw it. The report states what was MEASURED — how memory trended, any errors, any
  freezes, the trail — and never guesses a cause, because no browser will tell a
  page why a tab died. The one exception is a browser-CONFIRMED reclaim
  (`document.wasDiscarded`), which is stated outright because the browser said it.
- **Also check:** "no cause given" is the normal, honest answer, not a broken recorder —
  a force-quit, a shutdown and a flat battery are indistinguishable from a crash
  from inside the page. Check whether the report says the SAME tab came back; only
  that line separates "it reloaded itself" from "you closed it". And on Safari and
  Firefox there are no memory readings at all: `performance.memory` is
  Chromium-only, and the report says so rather than implying a healthy heap.
- **Triggered by:** long Studio sessions, decks with many chart/diagram slides,
  leaving Present or the Stage window open, or a phone backgrounding the tab.
  See `engineering/decisions/2026-08-10-studio-crash-sentinel.md`; to hunt the leak
  behind a report showing memory growth, reach for `npm run torture`
  (`tools/perf-torture/`).

## A "crash" notice appeared on returning to a tab, and nothing had crashed

- **Symptom (historical):** come back to a Studio tab left open in another app or
  another tab for a while, and a toast reads *"The Studio stopped unexpectedly —
  your decks are safe"*. Nothing crashed. It happened again the next time, and the
  next.
- **Cause:** browsers unload backgrounded tabs on their own schedule to reclaim
  memory, and **from inside the page that is indistinguishable from a crash** — the
  session record simply stops, exactly as it would if the renderer had died. The
  boot toast announced every such ending, so the notice most people saw was a false
  alarm, and a false alarm on a schedule is how the one true alarm gets ignored.
- **Fix (shipped):** the toast is gone. Recording captures the same things, but it is now OPT-IN (off by default);
  the report is a place you GO — **Workspace → General → Crash reports** — not a
  thing that finds you. The report also names this ending honestly now: a session
  whose last recorded state was hidden reads *"The Studio stopped while the tab was
  in the background"*, with "nothing to do" as its next step, rather than
  "unexpectedly". See `engineering/decisions/2026-08-18-crash-toast-retirement.md`.
- **Don't reintroduce:** an interruption for this class of ending. The recorder
  cannot tell an ordinary unload from a crash, so anything that shouts about it is
  wrong most of the time it fires.

## The Studio says a feature "hit an unexpected error" on a tab that has been open a while

- **Symptom:** a tab left open across a deploy — or any tab with a flaky connection — opens a
  feature it has not used this session (Fabricate, an export, a `.lattice` import) and gets an
  error card or a toast blaming the deck, the file, or "an unexpected error". Reproducible on
  demand: 404 a not-yet-loaded `/_astro/*.js` chunk and click the feature.
- **Cause:** the site serves only the CURRENT deployment (lattice.style is GitHub Pages;
  Cloudflare Pages is PR previews only), so a previous deploy's hashed asset is gone. A page
  that already loaded is fine — it runs the bundle it booted with — but a lazy `import()` for
  something never fetched resolves to a 404. On iOS this is the ordinary case, not an edge one:
  Safari restores tabs from memory without re-navigating, so a phone left on the Studio never
  learns a deploy happened. A correctly-shipped fix (#1233) looked broken on a real device for
  exactly this reason before anyone suspected the tab.
- **What it is NOT:** a crash. And do not read the message as proof a deploy happened — a 404, a
  403, a 500 and being OFFLINE all reject with byte-identical text in both engines (Chromium:
  `Failed to fetch dynamically imported module`; WebKit: `Importing a module script failed.`).
  `docs/src/lib/chunk-load.ts` recognizes the shape and says only what is observable; asserting a
  cause here tells an offline user a falsehood.
- **Recovery is a reload, and only a reload.** A retry cannot work for any cause: the browser's
  module map caches the rejection for the document's lifetime (measured: zero further requests)
  and `React.lazy` replays it. That is why the card offers one button.
- **Testing an iOS fix on this site?** Use a Private tab or force a reload first — a restored tab
  will happily keep serving you the pre-fix bundle while you conclude the fix failed.

## A crash report shows `Script error.` several times and names nothing

- **Symptom:** the crash report lists `window.onerror: Script error.` repeatedly,
  with no file, no line number and no stack, and the trail is mostly those repeats.
  Nothing in the Studio's own code matches.
- **Cause:** that exact string with everything else blank is not a Studio error —
  it is what a browser substitutes when a script it will not let the page read
  throws. The deployed `/studio/` loads **only same-origin** `/_astro/*.js`, so a
  fault in our own code always arrives with a real message and a stack. An opaque
  one therefore points outward: a browser extension, a content blocker, or an
  injected script (a translation or reader-mode feature counts).
- **Fix:** nothing to fix in the engine. The report now folds repeats into one
  line with a count, and states this attribution in calibrated terms
  (`isOpaqueError` in `docs/src/lib/crash-sentinel.ts`). To confirm on the
  reporter's side, load the same deck once with extensions disabled.
- **Also check:** do NOT read a pile of these as the cause of the crash. They are
  usually background noise from the browser, and the useful evidence in that
  report is elsewhere — the memory trend if the browser supplies one, the trail,
  and whether the same tab came back.
- **Triggered by:** any browser with content-script injection; first seen on
  Firefox for iOS. See `engineering/decisions/2026-08-10-studio-crash-sentinel.md`
  § "What the first REAL report changed".

## Data a user deleted comes back when a parked tab wakes up

- **Symptom:** the user clears their data in one tab; later, a record or file
  they deleted is back. No error, no warning — it simply reappears some seconds
  after they return to a tab they had navigated away from.
- **Cause:** the "we've been wiped" broadcast is a `storage` event, and a tab
  that is FROZEN — in the back/forward cache, or Page-Lifecycle-suspended as a
  phone does to a backgrounded tab — is not running tasks and never receives it.
  It thaws with its in-memory state intact and the next timer-driven write
  restores what was deleted. A live event cannot solve this; the failure mode IS
  "the recipient was not running".
- **Fix:** leave DURABLE evidence a waking tab can read, and check it on every
  wake path — `resume`, `pageshow` with `persisted`, AND the periodic write
  itself, which is the belt to those braces (see `catchUpOnWipe` in
  `docs/src/lib/crash-sentinel.ts`). The marker has to survive the wipe, or it
  cannot defend against the next sleeping tab; keep it contentless so that
  exception stays defensible.
- **Also check:** anything that writes on an unconditional timer. Stores that
  write only in response to user action (the deck autosave's 400ms debounce) are
  not exposed — a frozen tab does nothing, so it rewrites nothing.
- **Triggered by:** two tabs, one navigated away from, and any "delete my data"
  action. Reproduce with CDP `Page.setWebLifecycleState('frozen')` — dispatching
  a `resume` event by hand does NOT reproduce it, because the document was never
  actually stopped. See `engineering/decisions/2026-08-10-studio-crash-sentinel.md`
  § "The wipe a sleeping tab slept through".

## A Web Lock held for the life of a page silently kills its bfcache

- **Symptom:** back-navigation to a page becomes a full reload, and any code
  reading `pagehide`'s `persisted` flag stops seeing `true` — so a feature that
  detects "this tab went into the page cache" quietly becomes dead code.
- **Cause:** Chromium refuses to bfcache a document holding a Web Lock
  (`notRestoredReasons: [{reason: "lock"}]`, measured on Chromium 131). The trap
  is that releasing the lock in a `pagehide` handler does **not** fix it:
  eligibility is decided BEFORE `pagehide` fires, so `persisted` is already
  `false`, and a release gated on `persisted` can never run. The mitigation and
  the thing it mitigates are circularly dependent.
- **Fix:** treat "hold a lock for the document's lifetime" and "stay
  bfcache-eligible" as mutually exclusive and decide which the page needs. There
  is no arrangement of release handlers that gets both.
- **Also check:** whether anything downstream reads `persisted` — that is where
  the damage shows up, and it will be silent. In the Studio it was the iOS tab
  eviction signal, three files away from the lock.
- **Triggered by:** `navigator.locks.request(..., () => new Promise(() => {}))`
  as a liveness beacon. See
  `engineering/decisions/2026-08-10-studio-crash-sentinel.md` § "What the first
  REAL report changed", defect 1, attempt 3.

## Installed iOS PWA: "Connect OpenRouter" doesn't stick

- **Symptom:** On an iPhone with the docs site added to the home screen, a
  user connects OpenRouter in the Playground/Studio, but the installed app
  keeps asking them to connect (or the reverse: connected in the app, not in
  Safari).
- **Cause:** iOS gives an installed (standalone) PWA **separate storage**
  from Safari. The OAuth round-trip can bounce through Safari proper, so the
  key lands in Safari's `localStorage` — invisible to the installed app. Not
  fixable site-side; it's platform storage partitioning.
- **Fix:** connect from inside the surface you'll actually use. Related iOS
  limits (the 7-day storage eviction — Safari tabs only, installed apps are
  exempt — and the fixed `theme_color`):
  `engineering/decisions/2026-07-02-docs-pwa.md` § iOS caveats.

## The Present rail is completely invisible under `forced-colors: active`

- **Symptom:** In Windows High Contrast (or Chromium with
  `Emulation.setEmulatedMedia forced-colors: active`), the Present rail's
  track, its buffered range, its played fill AND the playhead mark all
  disappear. A `Highlight`-colored reference bar rendered in the same row
  shows up fine, so the row is laid out and painted — the rail's own ink is
  what goes.
- **Cause:** Every tier resolves through `--accent` / `--bg`
  (`docs/src/components/studio/present-rail-tiers.ts`), and forced-colors mode
  overrides author colors with the system palette. Nothing in the rail opts
  into `forced-color-adjust` or restates itself in system colors
  (`Highlight`, `CanvasText`), so all four tiers collapse to the same
  system-supplied background.
- **Mitigation:** None shipped. A `@media (forced-colors: active)` block
  painting the tiers in system colors — and distinguishing buffered from
  played by BORDER STYLE rather than tone, since tone is unavailable there —
  is the shape of the fix.
- **Triggered by:** Presenting with High Contrast on.
- **PRE-EXISTING, found not caused.** Verified in real Chromium against both
  the pre-#1389 three-tone ladder and the hatch that replaced it: **both**
  vanish identically, so the buffered-range rework did not make this worse and
  did not introduce it. Logged here rather than pulled into that diff (HARD
  RULE #18, off-path). It matters more than its size suggests: the buffered
  edge advancing while the played edge is frozen is the only signal that says
  "still working, not crashed", and in High Contrast there is no rail at all.
- **Removable when:** the rail carries a forced-colors block.

## A multi-line toast renders as a giant lozenge with its last line cut off

- **Symptom:** a toast carrying a title AND a description looks like an oversized
  black oval, its bottom line of text clipped by the shape's own curve. Reported
  as "not styled / not on brand".
- **Cause:** the shared Sonner toast is a **capsule** (`rounded-full`), which is
  the correct idiom for one short line ("Deck saved"). Stretched around three
  lines the radius stays 9999px, so the curve eats the corners of its own content.
- **Fix:** already handled in the primitive — `docs/src/components/ui/sonner.tsx`
  switches to a 16px card whenever Sonner renders a `[data-description]` element.
  If you are adding a similar override, note the `!`: Sonner's own
  `[data-sonner-toast]` rule is **unlayered** and beats a layered Tailwind
  utility whatever its specificity (HARD RULE #26). Without `!` the class sits in
  `class`, matches, and silently loses — measure `getComputedStyle`, don't trust
  the class list.
- **Triggered by:** any `toast(title, { description })` call. See
  `engineering/decisions/2026-08-10-studio-crash-sentinel.md` § 5.

## A control's own icon renders sliced/outside its button, and every overflow guard is green

- **Symptom:** A control in a tight toolbar paints part of itself outside its
  own border — the Studio deck switcher's chevron sat up to 20.5px past the
  pill's right edge, visibly clipped against the pill's border. Meanwhile
  `check:overflow` passes, `studio-header-fit.spec.ts` passes, and
  `header.scrollWidth - header.clientWidth` reads **0** the whole time.
- **Cause:** `min-width: 0` on a flex item lets it shrink below the intrinsic
  width of its OWN `shrink-0` children. They keep their size and render
  outside the parent's box. Nothing about that grows any ancestor's
  `scrollWidth`, so a page- or row-level oracle cannot see it — and the
  element most likely to hit this is precisely the one designed to *absorb* a
  row's pressure so the row's `scrollWidth` stays quiet.
- **Why `scrollWidth` on the offender doesn't catch it either:** an
  `overflow: visible` box omits its end padding from `scrollWidth`. Measured
  on the real pill: 11px of actual spill reported as `scrollWidth -
  clientWidth === 1` — inside the 2px tolerance both guards use. Measure
  **geometrically** (child rects vs. the parent's padding box) or you get a
  green run over a visible defect.
- **Fix:** Floor the absorber with `min-width` at the width its own
  non-shrinking content occupies (paddings + gaps + every `shrink-0` child),
  so the ROW overflows honestly where the row-level guards can see it. Then
  find the width that floor costs — if the row only "fit" because the absorber
  was clipping itself, it did not fit.
- **Guard:** `noChildSpill` in `docs/scripts/check-overflow.mjs` (per-PR) and
  `readPill` in `docs/e2e/studio-header-fit.spec.ts`, which also re-derives the
  declared `min-width` from the rendered box so the constant can't rot.
- **Two structural alternatives that do NOT work** (both measured in Chromium,
  don't re-litigate): dropping `min-width: 0` so the parent's own
  `min-width: auto` floors it pins the parent at the FULL untruncated title
  width — a flex item's min-content contribution is not reduced by
  `min-width: 0` on the truncating child; and `contain: inline-size` on that
  child zeroes its intrinsic size in BOTH directions, so the parent never
  grows to show a title at all, at any width.
- **Triggered by:** #1417.

## A CodeMirror `@media (pointer: coarse)` block has no effect on a real touch device

- **Symptom:** Touch-only sizes declared in a CodeMirror `EditorView.theme`
  silently never apply. The lint popup's fix button measured **28px** on a
  genuine coarse pointer where the theme asks for 44px — while
  `matchMedia('(pointer: coarse)').matches` reported `true`, the theme object
  was valid, both surfaces built, and every unit test passed.
- **Cause:** A theme object is a flat map that `style-mod` compiles to a
  stylesheet **in key order**, and a coarse-pointer rule usually targets the
  SAME selector as the base rule it overrides — so the two have equal
  specificity and later-in-the-object wins. Put the `@media` block above the
  base rules (or above a `...spread` that contributes them) and it loses to the
  very declarations it exists to override.
- **Fix:** Keep `'@media (pointer: coarse)'` **last** in the theme object, below
  every spread that contributes base rules.
- **Second trap, same cause:** a shared module must NOT carry its own
  `'@media (pointer: coarse)'` key. Spreading it into a theme that already has
  one *replaces* that block wholesale — in this codebase that would drop the
  16px `.cm-content` lift that stops iOS Safari auto-zooming on focus. Export
  the coarse rules separately (`lintThemeCoarse`) and merge them explicitly.
- **Why no cheap guard catches it:** nothing about it is a type error or a
  failing assertion on the object; only a real coarse pointer shows the defect.
  Pinned by an ordering test in `docs/src/lib/lint-theme.test.ts` that asserts
  the `@media` key appears after the `...lintTheme` spread in both consumers.
- **Triggered by:** the lint-popup redesign,
  `engineering/decisions/2026-08-16-lint-popup-finding-card.md`.
