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
