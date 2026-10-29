---
origin: 2927
priority: P15
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §5
source: https://github.com/Laticent/lattice/pull/2927
---

# The gallery names where the slide goes, and offers the last layout first

why now   — With no position switch, the title is where the gallery confirms the target.
where     — `docs/src/components/studio/SlidePicker.tsx` (`title` :434; keep the dialog's accessible name in step with `CHROME.addSlideDialog`).
done when — the title reads "New slide after '<title>'" (number as fallback) for every door and matches where the insert lands; the last-used layout is the first tile.
evidence  — UI/UX review.
verify    — Open the gallery from each door and compare the title with the result.
