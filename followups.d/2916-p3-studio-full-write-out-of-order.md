---
origin: 2916
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/workflow.md
deferred: off-path — the full-write path never checked for a newer render before this PR either, and guarding it changes first mounts and every theme switch
source: https://github.com/Laticent/lattice/pull/2916
---

# An older full write can land after a newer restyle in the Studio frame

why now   — #2916's card grader (round 2) read `docs/src/lib/single-slide-render.ts`: a restyle
            render stands down when a newer render has written or owns the sheet, but an older
            render that takes the FULL-write path (`fr.srcdoc = …`) checks neither. If it lands
            while a newer restyle is waiting on its sheet, the newer render stops (the frame's
            document was replaced) and the frame keeps the older slide. Before #2916 the end
            state was the same (the older write overwrote the newer one), so this is not a
            regression, and DeckPreview serializes its renders, so only callers that do not
            queue (the landing demos) can reach it.
where     — the full-write branch of `renderInto` in `docs/src/lib/single-slide-render.ts`
            (after the restyle fast path), and `newerOwns()` / `claim()`.
done when — the full-write branch returns the same `renderer disposed` sentinel when
            `newerOwns()`, with a test next to 'two overlapping restyle renders on one
            frame' in `single-slide-render.shared-sheet.test.ts`, and a first mount, a theme
            switch and a mode switch still write.
evidence  — a failing test first: an older full write started before, and finishing after, a
            newer restyle on the same host.
verify    — tier 1: the new unit test plus `npx vitest run src/lib/single-slide-render`.
