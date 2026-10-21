---
origin: 2840
priority: P3
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md
source: https://github.com/Laticent/lattice/pull/2840
---

# Typing in the Playground rescans the whole theme CSS for remote references on every render

why now   — the owner found the Playground sluggish; profiling 40 keystrokes on a 120-slide deck, on `main` and on this branch alike, put `remoteCssRefs` (lib/core/remote-ref.js) first at about 360 ms of 1.3 s of main-thread time, and the render that follows a pause blocks for 80-100 ms (11 frames over 33 ms, one of 100 ms).
where     — docs/src/playground/deck-render.js line ~536 (`remoteRef.webRefsInCss(css)` on every `renderDeck`); lib/core/remote-ref.js `remoteCssRefs`. The `css` string is the same theme and engine sheet between renders.
done when — a render whose CSS did not change does not rescan it, and the 40-key typing profile above drops `remoteCssRefs` out of the top three.
evidence  — `npm run bench` before and after (HARD RULE #19), the baseline re-blessed, and a bench scenario that covers a Playground render.
verify    — the same profile, same machine, on `main` and on the branch.
