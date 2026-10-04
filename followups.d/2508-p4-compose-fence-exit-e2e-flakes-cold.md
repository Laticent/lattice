---
origin: 2508
priority: P4
recorded: 2026-10-04
---

# `compose-fenced-code.spec.ts` "Enter on a blank last line leaves the fence" flakes on a cold build

why now   — found while running the Mermaid e2e specs for #2508 against a fresh `build:e2e`. The
            cell failed on its FIRST run after a build on both trees: inside a six-spec run on the
            branch, and alone on `main` (4107da0). Every later run passed: 1 of 2 failed on the
            branch, 1 of 5 on `main`. It is not #2508's, which touches no Compose code. The Studio
            e2e suite is nightly, so a cold-start flake there reads as noise and hides a real failure
            the night one lands.
where     — `docs/e2e/compose-fenced-code.spec.ts:193`; the Compose editor's fence-exit keymap
            (`docs/src/components/studio/ComposeView.tsx`, `docs/src/lib/compose/`).
done when — the cell waits on the condition the Enter handler needs (the editor and its fence
            catalog loaded) rather than the default timing, and passes ten cold runs in a row (a
            fresh `astro preview` before each).
evidence  — ten run summaries, each after `npx astro preview stop`.
verify    — tier 0 gates: a test-only change, unless the cause turns out to be in the keymap.
