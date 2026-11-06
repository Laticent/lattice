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
(`lib/core/subresource-csp.mjs`) has **no `script-src`**: it closes `img-src`,
`connect-src`, `object-src`, `base-uri` and `form-action` against data beacons, and leaves
script loading unrestricted. Same origin means a script in the frame shares the Studio's
`localStorage`, which is where the key lives. Closing `connect-src` does not save it: the
script can call `parent.fetch` (the parent's realm, without the frame's CSP) or set
`top.location` to a URL carrying the key.

So the guard is exactly one thing: `sanitizeSlideHtml` (`docs/src/lib/sanitize-slide-html.js`,
DOMPurify), which `srcdoc()` applies to every slide through `sanitizeOnce` before the markup
enters the frame. HARD RULE #22 already gates that the builder calls it
(`checkPreviewHtmlSinks`).

§3 does **not** add to this defense. It makes our own code auditable, but an injected script
does not need our module: it types `localStorage.getItem(…)` itself. The key's safety in the
preview rests on one sanitizer call. The stronger, defense-in-depth move is a `script-src` in
the frame's CSP that refuses inline event handlers, which are the vectors that fired
unguarded below; it is recorded as a follow-up, because the runtime and Mermaid scripts the
frame does need must be allowed by hash or nonce first.

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

**What this does not cover.** The proof drives the Studio preview only. The other surfaces
that render a deck on the key's origin were TRACED to a sanitizer call by the adversarial
pass below, not proved in a browser: the Stage popup (`stage-window.js`, `buildStageDoc`),
Print (`buildSrcdoc`), the export capture frame (`deck-export.js`), the webpage-export prune
frame (`player-prune-browser.ts`, which runs the assembled player on this origin), the Read
Article view (`projectSectionsToArticle`) and the Library scene art (`sanitizeSceneAssets`).

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
characters (`openRouterKeyHint`), with Replace and Remove. "API key" is a way to CONNECT the cloud
tier, not a third backend, so everything below the switch (spend, standing instructions, the
voice) treats it as Cloud. Pinned by `architect.test.ts` › "saveOpenRouterKey",
`WorkspaceSheet.test.tsx` › "the API key tab", and `docs/e2e/workspace-api-key.spec.ts`.

**Next (step 2), and what it has to answer.** OpenAI and Gemini accept OpenAI-shaped chat
requests and allow browser calls, so they can share the OpenRouter transport with a different
base URL, model list and price table. Anthropic's Messages API has its own request, streaming and
cache-control shapes and needs the `anthropic-dangerous-direct-browser-access` header, so it gets
its own transport. Per provider: no `/credits` or `/auth/key` (so the spend decision above), a
model list of its own, and voice only where the provider has one (OpenAI). Each provider key is
another secret in this origin's storage, some broader than OpenRouter's, which raises the value
of the preview-frame `script-src` follow-up (§4). `lib/openrouter-key.js` generalizes to one
module per-provider keys go through, keeping §3's one-reader property.
