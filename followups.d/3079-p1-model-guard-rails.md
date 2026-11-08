---
origin: 3079
priority: P1
recorded: 2026-11-08
area: website
severity: high
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: large — the owner split it out of PR #3079 (2026-11-08): a config layer, a new nightly workflow with four secrets, and a change to chat's dead-model behavior; it starts from main once #3079 merges
source: https://github.com/Laticent/lattice/pull/3079 (owner, 2026-11-08: "google sucks at keeping backward compatibility")
---
# Model guard rails: a hotfixable model config, a nightly availability check, and chat that stops instead of swapping

why now   — providers retire model ids with little notice (Gemini TTS especially). Today every
            default and preferred family is spread across code (provider-registry.js CURATED,
            GEMINI_TTS_DEFAULT_MODEL, or-catalog.js OR_FEATURED, tts-catalog.js TTS_FEATURED,
            architect-model.js's connect-time default), so a retirement needs a code change, and
            nothing notices until a user hits it.
decided   — owner, 2026-11-08, on PR #3079:
            1. ONE committed JSON config (e.g. docs/src/lib/models.config.json): every default,
               preferred family and retired id. The app bundles it; the nightly check reads it. A
               hotfix is a one-line PR plus the normal deploy. No runtime fetch.
            2. A NIGHTLY workflow checks every configured id against all four providers' model
               lists (OpenRouter's is public; Gemini, Anthropic and OpenAI need a repo secret each;
               listing is free, nothing spends) and opens an issue when one is gone. Each half
               skips itself while its secret is unset. Never OPEN_ROUTER_KEY (HARD RULE #24).
            3. CHAT gets the voice rule from #3079: a selected model that errors as gone turns chat
               off for that model with a notice; the silent self-heal to the latest-Sonnet alias in
               architect-model.js (`isDeadModelError`) is removed.
where     — docs/src/lib/provider-registry.js, docs/src/components/studio/ai/{or-catalog,tts-catalog,
            architect-model,direct-providers}.js, docs/src/playground/voice-model.js
            (`isModelGoneError`, the gone registry), .github/workflows/ (new nightly), a CI secret
            list for the owner.
done when — every model id the Studio names comes from the config file; the nightly run is green
            against live lists and opens an issue on a retired id (proved with a deliberately
            retired id in a dry run); chat shows "Model retired" and never substitutes.
evidence  — the nightly run's log; unit tests for the config loader and chat's gone path; an e2e
            with a 404ing chat model.
verify    — tier 2 maker-checker (CI contract + engine-adjacent).
