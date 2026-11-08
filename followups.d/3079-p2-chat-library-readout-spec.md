---
origin: 3079
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
deferred: off-path — fails identically on 6eed9783e, before the routes redesign; the chat cost readout and the Library's asset count are surfaces this PR does not touch
source: https://github.com/Laticent/lattice/pull/3079 (local Chromium run of docs/e2e/chat-library-assets.spec.ts)
---
# The chat cost readout no longer rises when the Library gains photos

why now   — `docs/e2e/chat-library-assets.spec.ts` "the cost readout rises by a few tenths of a cent
            when the Library gains photos" fails on the desktop project: "Make an edit" reads $0.11
            before and after three photos are added (expected greater). Reproduced on the commit
            before PR #3079's routes work, so it predates it. Per-PR CI does not run this spec.
where     — docs/src/components/studio/ChatCost.tsx (`libraryCount` from `assetChoices()`),
            chat-agent.ts `agentTurnUsd` (ASSET_TOOLS and `libraryPromptTokens`), and the readout's
            display precision.
done when — the spec passes: either the estimate rises by the Library's share and the readout shows
            it, or the spec is corrected to what the readout is meant to show.
