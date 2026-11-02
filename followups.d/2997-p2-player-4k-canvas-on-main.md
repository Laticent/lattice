---
origin: 2997
priority: P2
recorded: 2026-11-02
area: engine
severity: medium
swimlane: engineering/pipeline.md
deferred: off-path — fails identically on main at 379917f, before #2997; the player's canvas is not a surface #2997 touches
source: https://github.com/Laticent/lattice/pull/2997
---

# The exported player shows a 4K deck at 1280 x 720, not its own canvas (#1577's check is red on main)

why now   — `node tools/verify-player-input.mjs` fails one check, `4K: the deck keeps its OWN canvas in the
            player — 1280px x 720px` (expected 3840px x 2160px, deck examples/gallery-jargon.md), on #2997's
            branch and on a clean main worktree at 379917f alike: 77 passed, 1 failed in both. The check exists
            because a non-default canvas was once crushed into the player's hardcoded HD box (#1577).
            lib/core/export-canvas.js says the player is deliberately NOT lowered to HD ("the player's size
            does not follow its canvas"), so either the player regressed to the HD box, or something upstream
            of it now lowers a 4K deck before the player sees it. Not yet told apart.
where     — tools/verify-player-input.mjs:324-355 (the CANVASES block); lib/export/html-player.js;
            lib/core/export-canvas.js `exportCanvas` (RASTER_FORMATS, `loweredFrom4k`); lattice.js `--player`.
done when — the 4K row passes again (the section's computed box is 3840px x 2160px in the player), with the
            cause named: the player, or the canvas choice upstream of it. If the HD player is now intended, the
            check and export-canvas.js's header say so in the same change, with the owner's decision.
evidence  — node tools/verify-player-input.mjs, all four canvases green; bisect from the commit that last
            passed it to the one that broke it.
verify    — node tools/verify-player-input.mjs; cd docs && npm run test:e2e -- --project=player-parity
