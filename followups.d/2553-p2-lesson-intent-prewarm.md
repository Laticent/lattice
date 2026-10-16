---
origin: 2553
priority: P2
recorded: 2026-10-06
area: website
severity: low
swimlane: engineering/decisions/2026-10-05-studio-lessons.md
source: https://github.com/Laticent/lattice/pull/2553
---

# Pre-warm a lesson on intent, so the first beat does not wait on the network

why now   — a first lesson start fetches Vetrina's engine (19.1 KB gz), the lesson kit (1.5 KB) and the
            track (0.4–0.9 KB) in sequence after the tap; only the voice module (0.7 KB) is warmed today,
            when search opens. On a slow phone link that is a visible pause. Owner aligned 2026-10-06:
            warm on intent, never at idle (most visitors never start a lesson).
where     — docs/src/components/studio/use-studio-lesson.ts (`warmLessons`, the deep-link read 600 ms
            after mount), the palette's Learn group in StudioShell.tsx, lessons/catalog.ts (`loadLesson`).
done when — Learn rows shown → engine + kit fetched; a lesson row highlighted → its track + voice.json;
            `?lesson=` on load → everything at once, without the 600 ms wait; nothing pre-warmed under
            Save-Data; clip mp3s stay on demand; eager Studio bytes unchanged.
evidence  — tap-to-first-beat before/after on a throttled phone profile (HARD RULE #19: same machine,
            a bench scenario or a committed measurement script), plus the route-budget output.
verify    — tier 0 gates, because the change only moves when lazy chunks are fetched.
