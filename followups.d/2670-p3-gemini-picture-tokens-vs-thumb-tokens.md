---
origin: 2670
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2670
---

# The budget gate prices a picture at 800 tokens; Gemini 2.5 Flash Lite billed about 11,000

why now   — One live turn (decision note, "Live measurement, 2026-10-13") measured one 512 px picture at about
            11,000 prompt tokens, about $0.0009, on `google/gemini-2.5-flash-lite`, against the gate's 800. The
            model's `pricing.image` equals its prompt price, so the per-image surcharge shipped in #2670 cannot
            close the gap. At that price the miss is under a cent a picture; it grows with the model's rate.
where     — `docs/src/components/studio/agent-assets.ts` (`THUMB_TOKENS`, `pictureSurchargeUsd`),
            `chat-agent.ts` (the `cloudBudgetBlock` call).
done when — the cause is known (is it Google's image tokenization, OpenRouter's, or this thumbnail?) and the gate
            either charges a per-model-family picture figure or the note records why 800 stands, with a second
            measurement on a second Google model and one on Claude.
evidence  — usage.prompt_tokens from a turn with and without a picture on at least two models, same thumbnail.
verify    — tier 1 checker (it changes the budget gate); needs the owner's go-ahead for key spend (HARD RULE #24).
