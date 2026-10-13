---
origin: 2652
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2652
---

# The chat's cost readout leaves out the Library list, and a picture is a flat 800 tokens

why now   — The independent checker on PR #2652 found three small accounting gaps. None changes what the chat
            does; they change what it says a turn costs and how tight the hard-stop cap is.
            1. The per-turn readout (`agentTurnUsd`, `chatSystemTokens`) prices neither the Library list nor
               `ASSET_TOOLS`: about 600 tokens short for a 40-photo Library. The budget gate itself uses the
               real prompt, so only the readout is short.
            2. `THUMB_TOKENS` (800) is generous for Claude and GPT-4o but low for models that bill images by a
               large multiplier or a separate per-image price (`ORPrice` has no image price field).
            3. `thumbnail()` and `setCaption()` in `agent-assets-browser.ts` re-read the whole shelf, bytes
               included, once per photo: up to 6 full reads in one `view_asset` call.
where     — `docs/src/components/studio/chat-agent.ts` (`agentTurnUsd`), `architect.ts` (`chatSystemTokens`,
            `ORPrice`), `agent-assets.ts` (`THUMB_TOKENS`), `agent-assets-browser.ts`.
done when — The readout includes the list and the tools when the Library is non-empty; the picture charge reads
            the model's `pricing.image` when it has one; one shelf read serves a whole `view_asset` call.
