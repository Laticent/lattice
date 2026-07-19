---
date: 2026-07-19
status: shipped
area: studio / architect model
summary: Fabricate's "describe a component" froze — and on low-memory browsers
  crash-reloaded the tab — because the dedup "reuse nudge" cold-loaded a ~30MB
  transformers.js embedder (onnxruntime WASM, MAIN THREAD) and awaited it BEFORE
  the model call. Fix: the dedup pass uses embeddings only when the embedder is
  already warm; otherwise it falls through to the instant lexical ranker, so
  generation never triggers a cold main-thread model load in its hot path.
---

# Fabricate component generation: the dedup embedder cold-load in the hot path

## Symptom

> "When creating a component via prompt in Fabricate the page crashes and reloads."

Reported for the Component tab's "Describe a component" front door. The Theme
tab's "Describe a look" worked fine — the tell that this was component-specific,
not a general Studio/model fault.

## Root cause

`generateComponent` (architect.ts) runs a dedup pass **before** the model call:

```js
const similar = readDedupEnabled() ? await dedupComponents(prompt, catalog, model) : [];
// ...then: await model.complete(...)
```

`dedupComponents`' primary signal is bge-small embeddings:

```js
const vecs = await model.embed([prompt, ...catalog.map(corpusText)]); // 54+ catalog texts
```

and `embed()` (architect-model.js) **cold-loaded** the model the first time it
was ever called — on the **main thread**:

```js
const t = await import(TRANSFORMERS_URL);                 // ~the transformers.js lib
embedder = await t.pipeline('feature-extraction', EMBED_MODEL); // ~30MB onnx + WASM init, MAIN THREAD
const out = await embedder(list, { pooling: 'mean', normalize: true }); // main-thread inference
```

So the *first* component generation on a session `await`ed a ~30 MB download plus
an onnxruntime-web WASM pipeline init **on the main thread**, all gating the model
call. Consequences:

- **At best:** the "generating…" spinner hung for the whole download + init while
  the UI thread was blocked.
- **On a memory-constrained browser (notably mobile Safari):** a main-thread WASM
  model init is a classic tab-crasher — the page OOM-crashes and the browser
  reloads it. That is the reported "crashes and reloads."

Dedup is **on by default** (`readDedupEnabled()` → true unless `lattice-db-dedup`
is `off`), so essentially every first component generation hit this. The Theme
generator never embeds, which is exactly why it was spared.

Note the asymmetry with the *generation* on-device tier: `transformersGenBackend`
runs its model in a **Web Worker** (`WORKER_SRC`), off the main thread. The
**embedder** did not — it ran inline. That inconsistency is the bug's substance.

## Reproduction (real surface)

Drove the actual Studio in Chromium (Playwright), seeding a connected OpenRouter
session (`lattice-db-or-key`) and intercepting `/chat/completions` with a canned
gate-clean component reply:

- **CDN reachable** (embedder allowed to cold-load): after 8s the Component tab
  was still on the default `.callout` — generation never completed — and a request
  to `esm.run/@huggingface/transformers` had fired. Generation was blocked on the
  embedder load.
- **CDN blocked** (`route.abort()` on the transformers URL): generation completed
  instantly and the draft rendered — because `embed()` failed fast → `null` → the
  lexical fallback ranked → the model was called.

The contrast isolates the embedder cold-load as the blocker. (A true OOM
tab-crash needs a memory-constrained device and could not be reproduced on the CI
machine — recorded here as an inference from "main-thread WASM model init while
the thread is blocked", not a captured crash. UNVERIFIED on real mobile hardware
from this sandbox; the *freeze* is verified.)

## Fix

The dedup near-neighbor surfacing is an explicitly **best-effort "reuse nudge"**
(§5 of the component-gen design). It must never block or crash generation, and a
cheap, shipped, unit-tested fallback already exists (fuse.js lexical → pure
token-overlap `rankSimilar`). So: **do not let dedup cold-load a heavy main-thread
model in the generate hot path.**

- `architect-model.js`: `embed(texts, { allowLoad = true } = {})`. Extracted
  `warmEmbedder()`. With `allowLoad:false`, `embed` returns `null` immediately
  unless the embedder is **already warm** — it never triggers the cold import +
  pipeline init.
- `architect.ts` `dedupComponents`: calls `model.embed(list, { allowLoad: false })`.
  A cold embedder → `null` → the instant lexical ranker (step 2/3) does the work.

Semantic (embedding) dedup is preserved *when the embedder happens to be warm*
(e.g. the Drawing Board's retrieval loaded it earlier in the session); the common
cold case degrades to lexical ranking, which is good enough for a nudge and is
what already shipped on Safari/mobile/no-CDN anyway. Generation now completes on
the model round-trip alone.

## Not in this change (tracked, off-path — HARD RULE #18)

> **Both follow-ups below shipped in `2026-07-19-embedder-web-worker.md`** — the
> embedder moved into a module Web Worker at the shared `embed()` layer, so it is
> now off-thread for every caller (Fabricate dedup AND the Drawing Board), with no
> main-thread fallback. The notes are kept for provenance.

- `drawing-board-architect.js` retrieval (lines ~569/579) also cold-loaded the
  same embedder inline. The Drawing Board is **frozen** (2026-07-03-studio-
  succession.md), so it was logged, not touched here — but the worker fix at the
  shared `embed()` layer covers it without any Drawing Board feature edit.
- A proper fix for the underlying asymmetry is to run the **embedder in a Web
  Worker** like the generation backend, so semantic dedup could stay always-on
  without ever touching the main thread. Larger change; deferred → **done**.

## Verification

- Real Studio, CDN reachable: component now generates and renders in the preview
  (`section.<name>` present), **zero** `transformers`/CDN requests, no page errors.
- `architect.test.ts` (28) + `architect-model.cache.test.ts` (9) green; biome
  clean on both changed files.
