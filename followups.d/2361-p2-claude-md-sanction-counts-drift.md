---
origin: 2361
priority: P2
recorded: 2026-09-25
---

# CLAUDE.md #20 and #24 cite one sanctioned entry where the code has three

why now   — #20 says `SANCTIONED_MARGINS` holds one flex push; it holds 3. #24 says the only
            OpenRouter spender is `tools/component-gen-eval.mjs`; `SANCTIONED_OPENROUTER_SPENDERS`
            lists 3. The gates fail on stale entries, but nothing checks the prose about them.
where     — CLAUDE.md #20 and #24; `tools/check-ownership.js` (the two allowlists).
done when — both rule texts state the real entries, or point at the allowlist instead of counting.
evidence  — the diff against the allowlists at the same commit.
verify    — tier 0 self-review; it is a factual correction, not a change of meaning.
