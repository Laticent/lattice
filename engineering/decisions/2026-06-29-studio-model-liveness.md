---
status: in-progress
summary: Model ids rot — OpenRouter retires/renames models and a pinned id then 404s "No endpoints found" (we hit it three times: the Studio default claude-3.5-haiku, plus claude-3.5-sonnet/claude-3.5-haiku in the curated picker, #614). The durable fix is to stop pinning. (1) DEFAULTS use OpenRouter's server-resolved "latest" ALIAS — the `~vendor/family-latest` ids (verified callable; `~anthropic/claude-sonnet-latest` for the Drawing Board, `~anthropic/claude-haiku-latest` for the Studio) — so the default can never rot and always tracks the current version. (2) The curated picker lists are FAMILY PREFIXES (`anthropic/claude-sonnet`), not pinned ids; `inSet` prefix-matches them against the LIVE catalog so a version bump stays featured and a retired id can't strand the list. (3) The `/models` catalog is TTL-cached in localStorage (24h) + a session memo, served stale on fetch failure. (4) A chat call that fails with the dead-model signature SELF-HEALS — retries once with the rot-proof alias and drops the cached catalog so the picker refetches. (5) A unit test guards that every curated prefix still resolves against a live-id snapshot. Subsumes #614.
---

# Studio model liveness — stop pinning ids that rot

> **Corrected 2026-11-07:** the Studio does not pass the Haiku alias; its default is the Sonnet `~latest` alias (`DEFAULT_OR_MODEL`). Since `2026-11-07-studio-model-spine.md` the OpenRouter self-heal reports the model that actually answered, so the reply and its cost name it.

## The problem

OpenRouter model ids are not stable. A model is retired or renamed and the old
id then fails — `400 "… is not a valid model ID"` or `404 "No endpoints found"`.
We hit this three times in one feature:

- the Studio's connect-time default `anthropic/claude-3.5-haiku` (a fresh user's
  first AI action 404'd — fixed reactively in #613 by pinning `claude-haiku-4.5`,
  which will itself rot);
- two dead ids in the curated picker, `anthropic/claude-3.5-sonnet` and
  `anthropic/claude-3.5-haiku` (#614).

Pinning a concrete version is the root cause. The fix is to stop pinning.

## What we verified first-hand (against the live API)

- **`~vendor/family-latest` aliases exist and are callable.** `~anthropic/claude-haiku-latest`
  → `HTTP 200`, server-resolved to `anthropic/claude-4.5-haiku-20251001`. The
  non-`~` form (`anthropic/claude-haiku-latest`) `400`s — so the `~` prefix is
  load-bearing. Aliases exist for sonnet/opus/haiku/fable, gpt, gemini, etc.
- **`/models` carries `created` + `canonical_slug`**, so "newest in a family"
  resolves by timestamp if ever needed (no version-string parsing).
- **The picker already filters the LIVE catalog** (`filterModels` + prefix-matching
  `inSet`), so a dead *curated* id was a harmless no-op there — the real breakage
  was always the *default* (called directly, never filtered).

## The strategy

1. **Defaults = the `~*-latest` alias.** `DEFAULT_OR_MODEL = '~anthropic/claude-sonnet-latest'`
   (Drawing Board connect-time); the Studio passes `'~anthropic/claude-haiku-latest'`.
   OpenRouter resolves server-side, so the default tracks the current version and
   can never rot. The alias is also a real catalog entry, so price/name lookups
   for the cost estimate still work.
2. **Curated lists = family prefixes.** `OR_FEATURED` / `OR_VALUE` hold
   `anthropic/claude-sonnet`, `anthropic/claude-haiku`, … — `inSet` prefix-matches
   them against the live catalog, so a version bump stays featured automatically
   and a retired id can't strand a lens. (Aliases start with `~`, so they're
   excluded from the picker — it shows concrete, priced versions; a *deliberate*
   pick stays explicit.)
3. **Catalog cache (localStorage + TTL).** `listModels()` serves a 24h-TTL
   `{fetchedAt, models}` cache (session memo → localStorage), populates on
   miss/expiry, and serves stale rather than breaking the picker if a refetch
   fails.
4. **Self-heal on the dead-model signature.** A chat call that fails
   `isDeadModelError` (400/404 with the id signatures) retries ONCE with the
   rot-proof alias default and drops the cached catalog so the picker refetches —
   so a user whose *stored* pick died is recovered transparently rather than stuck.
5. **A rot-guard test.** `or-catalog.test.ts` asserts every curated prefix still
   matches a live-id snapshot (and carries no dead `claude-3.5-*` pins), so the
   curation can't silently rot to zero matches again.

## Why not the user's first instinct (cache + resolve newest ourselves)

The proposal was an IndexedDB catalog cache that we populate, then resolve
"latest" from. Two refinements made it simpler:

- We don't need to *resolve* latest for defaults — OpenRouter's alias does it
  server-side. So the default needs no catalog at all to stay current.
- localStorage (already wired via `readLS`/`writeLS`) over IndexedDB: the catalog
  is a small JSON blob; IndexedDB is more machinery than it needs.

The catalog cache + self-heal from the proposal are kept — as defense-in-depth
for *user-pinned* ids, which can still die.

## Trade-off (accepted)

`~*-latest` adopts a new model version **without review** — desirable for a cheap
iteration *default* (the whole point is to never rot), which is why aliases drive
*defaults* while the *picker* shows concrete resolved ids so a deliberate choice
is always explicit and priced.

## Scope

Shared kernel (`architect-model.js`, `or-catalog.js`) used by BOTH the Drawing
Board and the Studio → maker-checker. Subsumes #614 (closed by this change). No
new dependency; reuses the existing localStorage helpers + live `/models` fetch.
