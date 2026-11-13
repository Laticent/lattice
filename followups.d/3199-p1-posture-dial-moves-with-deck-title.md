---
origin: 3199
priority: P1
recorded: 2026-11-13
area: website
severity: low
swimlane: engineering/jank.md §What "jank" means here
deferred: off-path — the Studio header's layout; #3199 fixes the e2e wait that tripped on it, and a fixed slot for the deck chip is a design call on the header, not a test fix
---

# The posture dial moves when the deck's title changes length

why now   — The header's deck chip is as wide as the deck title, and the Read · Write · Craft dial sits to its
            right. Loading the chart gallery over the seed deck shrinks the chip from "Markdown for the boardroom…"
            to "chart", and the dial moves about 85px left at 1440px. A press that lands while the deck loads goes
            down on one stop and comes up on another, so no click fires. `studio-read-article-charts.spec.ts` hit it
            2 in 100 loaded WebKit runs (trace in #3199). A person is unlikely to press within that frame, which is
            why this is `low`.
where     — docs/src/components/studio/StudioShell.tsx (the desktop header row: deck chip, then `<PostureDial>`).
done when — the dial holds its x position across a deck switch at 1440px and 820px, for example by giving the
            deck chip a fixed or clamped width, or by anchoring the dial independently of the chip.
evidence  — `npm run check:jank` (engineering/jank.md) on a deck switch, before and after, and screenshots at
            three widths.
verify    — tier 1: maker-checker. The fix changes header layout, so bring the owner mocks first.
