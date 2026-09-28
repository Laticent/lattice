---
origin: 2410
priority: P2
recorded: 2026-09-28
---

# `present-bookends.spec.ts:56` is red on main: the spoken closing never appears

why now   — found while driving #2410's red e2e list; not on that list, and not caused by this
            branch. It fails the same way on HEAD 0ee4ab0 with none of this branch's changes
            (built with `build:e2e`, desktop, --workers=1; one run) and on this branch (3 of 3).
symptom   — the greeting and the middle slide play, the counter reaches 3 / 3, and the dialog
            never shows "Thank you. Questions are welcome." (the deck's `closing:`).
where     — docs/e2e/present-bookends.spec.ts:56; the closing bookend's path in
            docs/src/components/studio/PresentOverlay.tsx (narration bookends, #2423 b8efc4e8).
how       — check out b8efc4e8 and run the spec there: green means a later commit broke it
            (bisect #2436 / #2443 first, both touched Present), red means it never passed on
            desktop. Then read why the last slide's end does not hand off to the closing.
done when — the spec passes on main, or its cause is tracked and named.
evidence  — the spec before and after, on a `build:e2e` site.
verify    — tier 0: the spec.
