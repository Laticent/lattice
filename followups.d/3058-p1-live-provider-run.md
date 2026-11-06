---
origin: 3058
priority: P1
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7
deferred: blocked — needs real OpenAI, Anthropic and Gemini keys, which this session did not have; the owner's call (❓ D1 on #3058)
source: https://github.com/Laticent/lattice/pull/3058
---
# A live run of the four Studio faculties on each direct provider key

why now   — the direct keys (#3058) are proved only against mocked replies we wrote. A live run
            confirms each provider still accepts browser (CORS) requests, the OpenRouter catalog
            prices the real model ids, and real replies parse.
where     — .scratch/ harness (HARD RULE #24: on-demand, never per-PR); the Studio's Theme,
            Component, Finish and Motion faculties on each provider.
done when — each provider generates a theme, component, finish and drawing on its own key, and
            the Spend estimate is within 20% of the provider's billed figure.
evidence  — the transcript and costs per provider, under $1 total.
verify    — tier 1 checker.
