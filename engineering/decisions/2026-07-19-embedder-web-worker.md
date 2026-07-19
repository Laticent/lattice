---
date: 2026-07-19
status: shipped
area: studio / architect model
summary: Move the bge-small dedup embedder off the main thread into a module Web
  Worker (mirroring the generation tier), so it can never freeze or OOM-crash the
  tab, and semantic dedup can be always-on. Worker-only — no main-thread fallback;
  where module workers are unavailable, embed degrades to null → the caller's
  lexical ranker. Fixes both follow-ups from 2026-07-19-dedup-embedder-hot-load.md.
---

# The dedup embedder runs in a Web Worker (never the main thread)

## Context

`2026-07-19-dedup-embedder-hot-load.md` (PR #1110) stopped Fabricate's "describe a
component" from freezing / crash-reloading by making the dedup pass use the
bge-small embedder only when already warm (`embed(…, {allowLoad:false})`),
otherwise falling through to the instant lexical ranker. That was the acute fix,
but it left the embedder itself running **on the main thread** when it *did* load
(e.g. the Drawing Board's retrieval still cold-loaded it inline), and it meant
Fabricate's semantic dedup was effectively never on. Two follow-ups were tracked:

1. run the embedder in a Web Worker so semantic dedup can be always-on without
   ever touching the main thread;
2. the same latent main-thread cold-load in the frozen Drawing Board's retrieval.

This change does both — at the shared `embed()` layer, so (2) falls out of (1).

## What changed (`docs/src/playground/architect-model.js`)

- **`EMBED_WORKER_SRC`** — a module worker (the embeddings twin of the generation
  tier's `WORKER_SRC`) that dynamic-imports transformers.js, loads the
  `feature-extraction` bge-small pipeline, and answers `embed` messages with the
  pooled/normalized vectors (`tolist()`).
- **`embeddingsBackend()`** — a small worker-owner: `load()` is single-flight,
  never throws, and latches its result (true=ready, false=failed); `embed(list)`
  posts to the worker and resolves vectors or null. A worker error after load
  fails in-flight embeds to null rather than hanging.
- **`embed(texts, { allowLoad })`** now delegates to that backend. `allowLoad:true`
  awaits the (off-thread) worker load then embeds; `allowLoad:false` (Fabricate's
  hot path) embeds only if already ready, else kicks a **background** worker warm
  and returns null — so semantic dedup comes online for the *next* generation
  without ever blocking or crashing this one.

### Worker-ONLY — deliberately no main-thread fallback

Unlike the generation tier (which keeps a main-thread fallback because it needs
*some* backend), the embedder has **none**: every `embed` caller already degrades
to a lexical ranker (`rankSimilar` / fuse.js). So on a browser with no module-
worker support, `embed` returns null → lexical, and the embedder **never** runs on
the main thread under any path. That is the whole safety guarantee, stated as an
invariant rather than a hot-path guard.

### Both follow-ups, one change

Because the fix is at the shared `embed()`/`embeddingsBackend()` layer, every
caller — Fabricate dedup **and** the Drawing Board's `model.embed(...)` retrieval —
is now off-thread. The frozen Drawing Board gets the fix without any feature-level
edit (a shared-kernel correctness fix, not Drawing Board feature work).

## Verification

- Real Studio in Chromium (seeded OpenRouter session, mocked `/chat/completions`,
  transformers CDN stubbed): generating a component **spawns a `blob:` module
  worker**, the component **renders** (`section.<name>` painted), and there are
  **zero** page errors. The only transformers import reachable from `embed()` is
  inside the worker source (the sole main-thread transformers import belongs to the
  generation universal tier, which component generation never triggers) — so the
  observed CDN fetch is the worker's, off the main thread.
- Unit (`architect-model.tier.test.ts`, 8): the injected test hook precedes the
  guard; a cold `allowLoad:false` returns null (hot path never blocks); a cold
  `allowLoad:true` degrades to null where module workers are absent (jsdom) —
  never throwing, hanging, or importing transformers on the main thread.
- `architect.test.ts` (28) + `architect-model.cache.test.ts` (9) green; biome clean.

UNVERIFIED from this sandbox: an end-to-end embed *result* on real hardware (the
transformers model download is stubbed here) and iOS Safari's module-worker
cross-origin-import behavior — on iOS the worker load may fail, in which case embed
correctly degrades to null → lexical (no main-thread load), which is the safe path.

## Data-usage note

`allowLoad:false` now triggers a one-time **background** ~30 MB model download the
first time a user generates a component (off-thread). This is the deliberate cost
of always-on semantic dedup; it is tied to actual feature use (not page load) and
never blocks the UI. The lexical fallback still serves the first generation and any
browser where the worker can't load. Turning off "Suggest similar components" in
Workspace settings skips it entirely (dedup is gated on `readDedupEnabled()`).
