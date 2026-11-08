---
origin: 3087
priority: P3
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-08-studio-newcomer-bake.md §6
deferred: large — a new boot path for returning visitors; the unpushed spike must be redone, and it builds on PR A's seeding seam
source: https://github.com/Laticent/lattice/pull/3087
---

# Preview-first boot for returning Studio users

why now   — an earlier session's spike measured -26% time to visible for a returning visitor by drawing
            their last deck before the app finishes. Its code exists only in that session's sandbox.
where     — docs/src/pages/studio.astro; docs/src/components/studio/StudioShell.tsx; the seeding entry
            point PR A adds to docs/src/playground/single-slide-render.ts.
done when — a returning visitor's last frame is adopted by the first live render with no second render.
evidence  — a handoff bench (pixel diff at the hand-off) plus time-to-editable against main.
verify    — startup-bench on the desktop and phone profiles against main.
