# Gotchas — Docs site build and dev server (Astro + GitHub Pages)

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
  panels are inert while their neighbors are fine. Originally seen on the (now
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

## astro 7 backgrounds `preview` and `dev` FOR AN AGENT, and Playwright then dies with `Process from config.webServer exited early`

- **Symptom:** every Playwright run against the docs site fails before a single test
  body executes, with `Process from config.webServer exited early`. The build step
  before it succeeded, and the site serves fine by hand. **It does not reproduce on a
  GitHub runner** — which is the part that misleads.
- **Cause, and it is NOT "astro 7 daemonizes":** astro 7 backgrounds the server when it
  detects an AGENTIC environment, and only then. From
  `astro/dist/cli/preview/index.js`:

  ```js
  const agentDetected = !process.env.ASTRO_PREVIEW_BACKGROUND && isRunByAgent();
  if (flags.background || agentDetected) { await background(...); return; }
  ```

  `isRunByAgent()` is `am-i-vibing`'s `detectAgenticEnvironment()`, which in a Claude
  Code session returns `{ isAgentic: true, id: "claude-code", type: "agent" }`.
- **Measured on astro 7.2.10, same tree, same command:**

  | environment | result |
  |---|---|
  | Claude Code session | returns in ~3s, rc=0; `astro preview status` reports it up, "background" |
  | agent vars stripped, `CI=true GITHUB_ACTIONS=true` | stays in the FOREGROUND until killed |

  So `astro preview --port 4321` is fine on a GitHub runner and breaks for an agent.
  An earlier version of this entry said the daemon was unconditional and "identical in
  CI and locally"; that was inherited from #1491's attempt and never tested. It is
  wrong.
- **`astro dev` does the same thing** — `astro/dist/cli/dev/index.js` carries the
  identical branch on `ASTRO_DEV_BACKGROUND`. So the `cd docs && npm run dev` that
  CLAUDE.md and `engineering/development.md` tell agents to use now returns
  immediately and leaves the server running. Stopping it by port still works.
- **Mitigation for the e2e path:** `docs/scripts/preview-e2e.mjs` — `npm run
  preview:e2e` runs it instead of the CLI. It serves through astro's PROGRAMMATIC
  `preview()`, which runs in THIS process, so there is no fork to detect and CI and an
  agent session behave identically. It sets `strictPort` so a busy port is a loud
  error rather than a silent slide to 4322 with Playwright waiting out its 300s
  timeout on the URL nothing is serving.
- **DO NOT "helpfully" run `astro preview stop` first.** An earlier version did, as
  belt and braces against a daemon from another checkout. It cannot do that job —
  astro's preview lockfile is `.astro/preview.json` resolved against the ROOT, so a
  daemon from a different checkout is invisible to it. And on an **astro 6** tree it is
  destructive: astro 6's preview CLI has no `stop` subcommand, ignores the positional,
  and STARTS A FOREGROUND SERVER. The `spawnSync` never returns, and a server is left
  holding 4321.
- **What a stray server on 4321 then costs is silent, not loud.** `reuseExistingServer`
  is on outside CI, and Playwright probes the URL *before* running the `webServer`
  command — so if anything answers, the command never runs and the suite tests whatever
  is there. Measured twice while writing this entry: once **179 tests went green
  against a build the branch under test had never produced**, and once a `@smoke` run
  reported 4 failures belonging to a different worktree entirely.
- **So if an e2e result looks surprising — too good or too strange — check the tree you
  are testing has a `docs/dist/`**, and that nothing else is serving
  (`ps aux | grep 'astro.*preview'`, `curl -s -o /dev/null -w '%{http_code}'
  http://127.0.0.1:4321/studio/`).
- **Triggered by:** the astro 6 → 7 bump (#1483).
- **Removable when:** astro offers a documented, stable way to force the foreground
  (`ASTRO_PREVIEW_BACKGROUND` is astro's own marker for the process it forked, not a
  public opt-out), or Playwright grows a way to adopt a daemonizing server command.

## A CSS custom property reads back as `#1478dc` where the source says `rgb(20, 120, 220)`

- **Symptom:** something that reads a `--custom-property` off the docs site and compares it to
  a string stops matching — a test, a probe, a debug assertion. The color on screen is
  unchanged, and a pixel comparison of the page finds nothing.
- **Cause:** a custom property's COMPUTED value is the token stream that survived the build,
  not a parsed color — CSSOM does not normalize it, so whatever the stylesheet ends up
  containing is what you read back. astro 7's CSS minifier (vite 8) rewrites color literals
  in author CSS, so `--vt-accent: rgb(20, 120, 220)` ships as `--vt-accent:#1478dc`. astro 6
  left it alone. Measured on the astro 6 → 7 bump (#1483): `docs/dist/vetrina-exemplars/`
  carries the hex form on 7 and the `rgb()` form on 6, from a source file that says `rgb()`.
- **This is serialization only.** The rendered page is byte-identical — the astro 6 and astro 7
  renders of the Studio, Playground and landing at 1440/820/390 compare pixel-for-pixel equal.
  Nothing in `lib/` is affected either: the ENGINE's CSS is built by `build-css.js`, not by
  astro, so only the docs site's own author CSS goes through this minifier.
- **Fix: read it as a color rather than as a string.** Set the raw value on a throwaway
  element's `color` and read `getComputedStyle(probe).color` back — the browser's own parser
  canonicalizes every spelling to `rgb(...)`. `docs/e2e/vetrina-exemplars.spec.ts` does exactly
  this, and its comment says why.
- **What is NOT affected, checked:** every other reader of a custom property in `docs/src` and
  `lib/` either tests it for emptiness, `parseFloat`s it, or passes it straight back into CSS.
  None compares a color literal.
- **Triggered by:** the astro 6 → 7 bump (#1483).

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

## An `<astro-island>` without `ssr` is mounted, not yet wired — clicks still vanish

- **Symptom:** An e2e click on a server-rendered React control does nothing. The
  element is attached, visible, stable and enabled, so Playwright's auto-wait is
  satisfied and the click "succeeds" — then the assertion on the next line times
  out against a page that looks perfectly healthy. Intermittent: it shows up under
  worker contention and disappears at `--workers=1`, which reads like a blip.
- **Cause, part one:** an island rendered `client:load` ships its HTML in the
  document. Presence proves the SERVER ran, nothing about the client. React does
  not replay an event that fired before hydration, so the click is dropped on the
  floor rather than queued. Measured on `/playground/?view=edit`, idle: the Galleries
  trigger is in the DOM at **~55–130ms** (the low end moves most with machine load —
  measured 56–90ms on an idle box and 102–128ms on one mid-build), and "wired"
  depends on which milestone you
  time — React's per-node marker at **~310–385ms** (window ~230–300ms), the app's own
  `body[data-view]` at **~380–540ms** (window ~290–480ms). `data-view` is set from an
  effect and so lands strictly later than the marker; both are non-clicking
  measurements and they agree on the ordering. Wider on a busy machine. Don't blend
  the two ends into one range — an earlier version of this entry did, and half of it
  came from a clicking probe that perturbs what it times.
- **Cause, part two, and this is the trap inside the trap:** the obvious fix — wait
  for `<astro-island>` to drop its `ssr` attribute — is **also too early.**
  `@astrojs/react`'s client calls `startTransition(() => hydrateRoot(…))`, which
  returns immediately; the island's `await this.hydrator(...)` therefore resolves and
  it removes `ssr` while React has not yet done its work. Measured with the island's
  JS delayed: `ssr` dropped roughly **30–70ms** before React's per-node marker
  appeared (31–70ms desktop, 39–48ms phone, two independent runs). Take the ordering
  as the finding — `ssr` was never late in any run — and the magnitude as an
  illustration. An earlier probe reported 81–118ms by timing `ssr` → the first
  synthetic click that worked, but it clicked on every frame and so perturbed the
  hydration it was timing; that figure is an upper bound from the method, not the gap.
- **Fix:** `controlReady` in `docs/e2e/studio-fixture.ts` requires BOTH — the island
  has dropped `ssr`, AND the control's own DOM node carries React's per-node marker
  (`__reactFiber$…` / `__reactProps$…`). Be precise about that second one: React
  assigns those in `completeWork`, the RENDER phase rather than the commit, so it is
  a behavioral gate rather than a proof — what earns it is that the marker landed in
  the same frame as the first working click in every run of two independent
  measurements. It is a React internal on purpose: there is no app-level signal
  covering every control this helper is pointed at, and if a React upgrade renames it
  the poll times out loudly instead of certifying an unwired control.
- **Nothing pins the second condition.** Delete it and every spec stays green — the
  margin simply re-hides behind Playwright's own click round-trip. Its evidence is
  the measurement, not a test.
- **How to tell them apart when you are stuck:** the window is invisible to
  `page.waitForLoadState`, to `networkidle`, and to any assertion about the element
  itself — they are all true throughout it. Reproduce it deterministically by
  delaying the island's module (`page.route(/\/_astro\/.*\.js/, …)` with a sleep),
  which does to hydration what a contended worker does.
- **Triggered by:** #1815.
