---
origin: 2795
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-19-studio-main-thread-jank.md
---

# Close three small gaps in the Studio's hover cue

why now   — #2795 gave a collage photo a zoom cursor, an accent ring and more lift, and a review found three
            small things it left: the Studio ignores a hovering pen (`onHover` returns early for any pointer
            that is not a mouse), the copy-button `pointer` cursor branch has no test, and the new
            slide-change case is covered only with a wheel, not with a key.
where     — docs/src/components/studio/StudioShell.tsx (`onHover`), docs/e2e/collage-lightbox.spec.ts.
done when — a hovering pen gets the cursor and ring, or the early return is justified in a comment; one spec
            drives the copy-button cursor over a real code slide; one spec changes the slide with a key under
            a still mouse.
evidence  — the review notes in the PR #2795 thread.
verify    — the three Playwright cases in Chromium, and Firefox where the case is tagged `@gecko`.
