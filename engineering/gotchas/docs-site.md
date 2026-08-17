# Gotchas — Docs site (Astro + GitHub Pages)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## `astro dev` serves stale assets after previewing a production build (service worker)

- **Symptom:** After running `astro preview` (or the e2e suite) and then
  switching to `astro dev` on the same port, the dev site shows stale modules,
  `504 Outdated Optimize Dep`-style noise, or edits that don't take. Hard
  refresh doesn't help; an incognito window does.
- **Cause:** The docs site ships a **service worker** (`docs/public/sw.js` —
  offline cache, see `engineering/decisions/2026-07-02-docs-pwa.md`). It
  registers on **production builds only**, but `astro preview` and `astro dev`
  share the `localhost:4321` origin, so a worker registered while previewing
  keeps controlling the dev server's pages and serves its
  stale-while-revalidate cache — including Vite's module URLs.
- **Fix:** Usually none needed — dev builds emit a self-destroying script
  (`docs/src/components/site/PwaHead.astro`) that unregisters any worker on
  load; one reload after switching to dev clears it. If a worker somehow
  lingers: DevTools → Application → Service Workers → Unregister (or
  `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`
  in the console), then reload. In Playwright, workers are blocked globally in
  `docs/playwright.config.ts` (`serviceWorkers: 'block'`) so route mocks keep
  seeing same-origin GETs; only `e2e/pwa.spec.ts` opts back in.

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

## `build:check` fails: "builds a live preview frame … not a sanctioned preview builder" (HARD RULE #22)

You added (or refactored into) a `docs/src` module that assembles a live slide
preview — i.e. it concatenates the runtime `<script>` injection into an iframe
`srcdoc`. Untrusted engine HTML (a shared / AI-generated deck or component
skeleton, rendered with `html:true`) reaching that **same-origin, un-sandboxed**
frame un-sanitized is XSS → OpenRouter-key theft (#616,
`engineering/decisions/2026-06-29-component-transformer-threat-model.md`). Fix:
run the slide HTML through `sanitizeSlideHtml` (`docs/src/lib/sanitize-slide-html.js`,
DOMPurify) **before** it enters the frame, then add the file to
`SANCTIONED_PREVIEW_BUILDERS` in `tools/check-ownership.js` with a one-line
justification. The same gate also fires if a *listed* builder drops its
`sanitizeSlideHtml` call, or if a sanction goes stale — keep both in sync. A file
that only assigns a builder's output to `.srcdoc` (no `<script>` injection of its
own) is not a builder and needs no entry.

## `build:check` fails: "embeds a `<style>` element but does not call `sanitizeStyleText`" (HARD RULE #22)

The **stylesheet** channel of the same frame. A preview builder assembles one
document out of two caller-influenced strings, and sanitizing only the markup half
leaves the other half open:

```
'…<style id="lattice-theme">' + themeCss + '</style></head><body>' + slideHtml
                                ^ this one                          ^ sanitizeSlideHtml
```

A `<style>` element's content is HTML **RAWTEXT**, which ends at the first `</style`
and knows nothing about CSS comments or strings. So a `</style>` carried in theme or
author CSS — sitting inside a perfectly well-formed CSS comment, even — ends the
element, and everything after it is parsed as **markup** in the live, same-origin,
un-sandboxed frame. Measured in Chromium 131: `</style>` alone runs script; closing
the CSS comment with `*/` alone does not. The input is untrusted by construction: a
Studio theme's `description` rides in that sheet's comment header and is
model-populated (Fabricate seeds it from the reply).

**Fix:** pass the stylesheet text through `sanitizeStyleText`
(`lib/core/sanitize-style-text.mjs`) before it enters the frame. It escapes only the
element terminator (`<\/style`, a valid CSS escape that computes identically), is
idempotent, and returns the input by identity when there is nothing to escape — it is
**not** a CSS sanitizer and must not become one. Builders with no `<style>` element
owe nothing here. See
`engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md`.

## Docs build fails `stale: <name>.<mood>: gallery PDF changed since the WebP was generated`

- **Symptom:** `docs-build` (and the Cloudflare `preview` job) go red on
  `npm run showcase:check` — before Astro even starts — naming one or two
  component·mood pairs. Nothing about the docs site was touched in the PR.
- **Cause:** The landing showcase strip is rasterized from the **committed
  component gallery PDFs** (`lib/components/<bucket>/<name>/<name>.gallery.<mood>.pdf`),
  and `docs/scripts/showcase-sources.json` records each source PDF's sha256 at
  generation time. Re-blessing a gallery golden — which any engine or theme change
  that legitimately moves pixels has to do — changes that sha, so the WebPs are by
  definition cut from a PDF that no longer exists. The gate is doing its job
  (#794: the set drifted silently for a week and shipped a stale render).
- **Fix:** `node docs/scripts/rasterize-showcase.mjs` and commit what changes.
  Often that is **only** `showcase-sources.json` — the strip samples one page per
  gallery (`page` in that file), so if the drift missed that page the WebP bytes
  are identical and just the hash record needs updating.
- **Do it in the same commit as the re-bless.** `npm run build:check` does not
  cover the docs workspace, so a local all-green tree can still land this red.

## A docs panel is dead in `astro dev` only (source CJS served over `/@fs`)

- **Symptom:** In `astro dev` (local docs preview), a whole `<script>` block's
  panels are inert while their neighbours are fine. Originally seen on the (now
  removed) Drawing Board, whose entire left rail went dark; the trap is not
  surface-specific and bites any docs surface that imports a repo CJS core
  directly. The console shows
  `The requested module '/@fs/.../lib/authoring/lint-core.js' does not provide
  an export named 'default'`. The **deployed/built** site works — it's dev-only.
- **Cause:** That `<script>` block imported the repo's pure CommonJS authoring
  engines directly (`import lintCore from '../../../lib/authoring/lint-core.js'`,
  + review-core, scorecard). Rollup's `commonjsOptions` converts CJS→ESM in the
  **build**, but Vite's **dev** server serves a source CJS file fetched over
  `/@fs` (above the docs root) *without* that transform, so its `module.exports`
  surfaces no `default` export. The first such import (lint-core) throws and
  aborts the entire block, taking every panel mounted in it down with it. The
  config comment claiming the build nudge fixed dev was wrong — it never covered
  dev. (Leaf-or-not is irrelevant; the `/@fs` source-CJS serve is the trap.)
- **Fix:** Consume the cores through a committed esbuild bundle —
  `tools/build-authoring-core.js` → `docs/src/playground/authoring-core.generated.js`
  (one in-root ESM module, real named exports `{ lintCore, reviewCore,
  scorecard }`) — exactly as the Theme Studio (`theme-core.generated.js`) and
  Layout Studio (`layout-core.generated.js`) already do. Importers switch to
  `import { … } from './authoring-core.generated.js'`. A lefthook
  `authoring-core-bundle-freshness` gate (glob on the three sources +
  the tool) byte-diffs via `npm run authoring-core:check`. The now-needless
  `commonjsOptions` for `lib/authoring` is removed.
- **Removable when:** the authoring cores become real ESM (then a direct import
  works in dev and the bundle/gate can go). Until then the bundle is the contract.
- **Commit:** `fix(docs): load Architect authoring cores via an esbuild bundle so
  they work in astro dev`.

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

## Docs `npm run dev` → `sh: 1: astro: not found`

- **Symptom:** `cd docs && npm run dev` (or `npm run start`) prints the
  sync-step output then dies with `sh: 1: astro: not found`; no server.
- **Cause:** Two compounding things. (1) `docs/` is a **separate npm
  package, not a root workspace**, so a fresh sandbox's root `npm install`
  (and the SessionStart hook) never installs `docs/node_modules` — run
  `cd docs && npm install` once. (2) Even installed, the `dev`/`start`
  scripts chain `… && astro dev` and `astro` doesn't resolve on PATH in
  this sandbox's script shell.
- **Mitigation:** Install docs deps once, then invoke the binary directly:
  `cd docs && ./node_modules/.bin/astro dev --host 127.0.0.1 --port 4321`
  (run `npm run sync:portal && npm run sync:playground` first if you need
  fresh portal/playground assets). Pages serve under the `/lattice` base.
- **Triggered by:** Starting the docs site for a preview/screenshot.
- **Removable when:** docs becomes a real workspace AND the script PATH
  resolves — until then, the direct-bin invocation is the reliable path.

## `pkill -f astro` kills the shell that's launching astro

- **Symptom:** A launch script that does `pkill -f "astro"` then starts
  `astro dev` exits with a non-zero signal code (e.g. 144) and the server
  never comes up — even though astro is installed and works.
- **Cause:** `pkill -f` matches on the **full command line**, and the very
  shell running the compound command has "astro" in its argv (the
  `… astro dev …` it's about to exec), so `pkill` terminates itself.
- **Mitigation:** Don't broad-match-kill from inside the launching shell.
  Stop a stale server by **PID** (saved at launch) or by **port**, or use a
  pattern that can't match the current command line.
- **Triggered by:** "Restart the dev server" one-liners.
- **Removable when:** Never — inherent to `pkill -f` self-matching.

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

## A slide surface ignores one input device (a wheel mouse does nothing; arrows are dead)

- **Symptom:** A surface that shows a slide turns fine with one input and not
  another — a trackpad flick works but a wheel mouse does nothing, or swipe
  works but the arrow keys are inert. Typically it works on the machine the
  feature was written on, which is what keeps it alive.
- **Cause:** The surface hand-rolled its own rule for that verb instead of
  reading the kernel. The classic is a wheel test written as "horizontal
  intent" — `Math.abs(deltaX) <= Math.abs(deltaY)` returns early for the pure
  `deltaY` a wheel mouse always emits, so the rule answers a trackpad and
  ignores every mouse (#1294). The keyboard version is a hand-written
  `e.key === 'ArrowRight' || …` list that drifts from `PRESENT_KEYMAP` and
  quietly drops PageUp/PageDown — which is what a presentation clicker sends.
- **Fix:** Take all three rules from `lib/core/present-transport.mjs` —
  `keyAction`/`PRESENT_KEYMAP` (keyboard), `swipeAction` (touch),
  `createWheelGate` (mouse + trackpad, dominant axis) — plus
  `docs/src/lib/deck-nav.ts`'s `shellKeyAction` for any surface where the user
  can also be typing. Never branch a verb on breakpoint or on a pointer-capability
  probe: a laptop has a touchscreen, a tablet has a keyboard case, a phone can
  have both. See `engineering/decisions/2026-08-10-input-verb-parity.md`.
- **Also check:** an `<iframe>` over the slide swallows wheel and touch before
  they reach your listener. Both the Studio's preview holder and the presenter
  screen's stage frames set `pointer-events: none` for exactly this reason.
- **Triggered by:** adding a new surface that shows slides, or "fixing" gesture
  navigation locally instead of in the kernel.

## A pinch on a slide turns the deck (and `preventDefault` in your React handler does nothing)

- **Symptom:** Two fingers on a slide surface navigate instead of zooming, and the
  page zooms at the same time. On a laptop, pinching a trackpad scrubs back and
  forth through the deck. Adding `e.preventDefault()` to the React `onWheel` /
  `onTouchMove` handler changes nothing at all.
- **Cause:** Two independent traps that show up together.
  1. **Nobody counted the fingers.** The swipe rule reads the first touch against
     the last (`touches[0]` vs `changedTouches[0]`). During a pinch each finger
     travels ~100px horizontally, which clears `swipeAction`'s 45px threshold with
     a perfect horizontality ratio — so it fires confidently on the gesture that
     means the opposite. A trackpad pinch has the same shape through a different
     door: Chromium delivers it as a `wheel` event with `ctrlKey` set, so a wheel
     gate that ignores `ctrlKey` navigates on every pinch.
  2. **React's synthetic touch/wheel listeners are PASSIVE.** They are attached at
     the React root, and a passive listener cannot `preventDefault()`. The call is
     a silent no-op: the code reads correctly in review and the browser keeps
     zooming the page underneath you.
- **Fix:** Take the rule from `lib/core/present-transport.mjs` —
  `createZoomGesture` owns the finger count and returns `{swipeBlocked}` from
  `up()`, which you must check *before* calling `swipeAction`. Bind the surface
  with `docs/src/lib/preview-zoom.ts`'s `attachPreviewZoom`, which uses NATIVE
  `{passive: false}` listeners, sets `touch-action: none` so the browser cannot
  claim the gesture first, and suppresses Safari's `gesturestart`/`gesturechange`.
  Let ONE controller own the surface's whole input stream — a second React handler
  racing it over the same touch stream is how the swipe rule and the zoom rule
  disagree about what a gesture is. See
  `engineering/decisions/2026-08-10-preview-pinch-zoom.md`.
- **Also check:** verify MID-DECK. A misfired `prev` on slide 1 clamps and looks
  exactly like a gesture that was correctly ignored — a probe that starts on slide
  1 will report a false pass.
- **Triggered by:** adding gesture handling to a surface that shows a slide, or
  reaching for React's `onTouchStart`/`onWheel` props for anything that must
  preventDefault.

## The Studio "crashed" and reloaded itself, and nothing was logged anywhere

- **Symptom:** the Studio vanishes and the page comes back fresh, mid-session. The
  console is empty, no error card appeared, no boundary fired, and nothing in
  `ErrorBoundary` / `chunk-load` / `window.onerror` has any record of it. Often
  after a long session, a big deck, or time spent in Present.
- **Cause:** this is not a JavaScript exception, so no in-page handler can see it.
  Either the tab's **renderer process died** (out of memory is by far the most
  common — the Studio holds a live preview iframe, Present's second render surface,
  a presenter popup, export workers and on-device model workers at once) or the
  browser **discarded** a backgrounded tab under memory pressure. In both cases the
  page's JS is already gone: `beforeunload`, `pagehide` and every boundary are
  dead, and the reload that follows wipes the console.
- **Fix:** don't go looking in the console — there is nothing there and there never
  will be. Read the crash report. The Studio records a rolling session record
  (`docs/src/lib/crash-sentinel.ts`) and, on the boot after an unclean end, shows a
  toast → a report with the heap trajectory, main-thread stalls, the last error and
  the breadcrumb trail. It is also reachable at any time from **Workspace → Crash
  reports**. The report states what was MEASURED — how memory trended, any errors, any
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
  leaving Present or the presenter window open, or a phone backgrounding the tab.
  See `engineering/decisions/2026-08-10-studio-crash-sentinel.md`; to hunt the leak
  behind a report showing memory growth, reach for `npm run torture`
  (`tools/perf-torture/`).

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
