---
origin: 3048
priority: P8
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7
deferred: large — a provider adapter, two transports (OpenAI-shaped and Anthropic), per-provider model lists and price tables; the owner chose a separate PR
source: https://github.com/Laticent/lattice/pull/3048
---
# Direct OpenAI, Gemini and Anthropic keys in the API key tab

why now   — the owner asked for keys from OpenAI, Anthropic and Gemini as well as
            OpenRouter, and chose to ship the pasted OpenRouter key first (#3048) and the
            direct providers next, in their own PR.
where     — docs/src/components/studio/ApiKeyPanel.tsx (a provider picker);
            ai/architect-model.js (a provider adapter: OpenAI-shaped for OpenAI and Gemini,
            a Messages-API transport for Anthropic); lib/openrouter-key.js (generalized to
            per-provider keys, still the one reader); the Spend tab.
done when — each of the three providers generates a theme, component, finish and drawing
            on its own key; Spend shows the session estimate plus "Balance not available
            for this provider" with a billing link; a revoked key shows Reconnect as in §2.
evidence  — a live run per provider (under $1 total) and the mocked e2e per provider.
verify    — tier 2 trio: three new secrets in the origin's storage.
