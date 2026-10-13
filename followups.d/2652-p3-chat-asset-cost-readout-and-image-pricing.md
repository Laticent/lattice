---
origin: 2652
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2652
---

# A picture is priced as a flat 800 tokens, whatever the model charges for images

why now   — Narrowed by the PR that fixed the rest. The cost readout now includes the Library list and the three
            asset tools, and one shelf read serves a whole `view_asset` call (both done). What is left is that
            `THUMB_TOKENS` (800) is generous for Claude and GPT-4o but low for models that bill images by a large
            multiplier or by a separate per-image price, and `ORPrice` has no image price field, so the budget gate
            can under-price a round of pictures on such a model by a few tenths of a cent.
where     — `docs/src/components/studio/agent-assets.ts` (`THUMB_TOKENS`), `architect.ts` (`ORPrice`),
            `ai/architect-model.js` (`listModels`, which does not read `pricing.image`), `chat-agent.ts`
            (`cloudBudgetBlock` call).
done when — `ORPrice` carries the model's per-image price when OpenRouter lists one, the budget gate charges that
            instead of the flat figure for a picture, and a test pins both a model with an image price and one
            without.
