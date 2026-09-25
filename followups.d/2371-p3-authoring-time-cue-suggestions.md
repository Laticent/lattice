---
origin: 2371
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# The Studio suggests `_cues` with a model, on the user's own key

why now   — owner ruling Fork 2b: a model may propose what matters, at authoring time only, writing
            ordinary directives the author can read and delete. The exported file stays deterministic
            and offline, and our OpenRouter budget stays out of it (#24).
where     — the Studio Playground's BYOK path; the `_cues` grammar from the word-anchored cue item;
            engineering/decisions/2026-09-25-vetrina-delivery-presets.md §4 source 3, §8 step 10.
done when — a "Suggest emphasis" action writes `_cues` into the open deck on the user's key, and the
            linter accepts what it writes.
evidence  — a built-Studio run against a mocked endpoint (page.route); no test reads OPEN_ROUTER_KEY.
verify    — maker-checker.
