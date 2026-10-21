---
origin: 2793
priority: P2
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-19-studio-main-thread-jank.md
---

# Cut the fit check's fixed cost: reuse the live render instead of rendering the draft again

why now   — #2793 made the agent's per-edit fit check render only the slides the turn changed. On a 40-slide
            deck at 4x CPU the longest main-thread gap fell from about 2.0 s to 1.1 s. What is left is fixed
            per-frame cost, not per-slide work: the whole-deck markdown render, sanitizing, the frame's runtime
            boot and browser layout. A profile showed the runtime and the sanitizer as the top scripts.
where     — docs/src/components/studio/draft-fit.ts (`measureDraftFit`, `buildDeckRender`),
            docs/src/components/studio/export/deck-export.js (`measureDeckFit`, `createCaptureFrame`).
done when — a measured plan names which of the fixed costs can be shared with the live preview (render the
            draft once, or patch only the changed slides into a kept frame), and one is shipped with before
            and after numbers on the 40-slide gallery deck at 4x.
evidence  — the profile in the PR #2793 thread; the table in
            engineering/decisions/2026-10-19-studio-main-thread-jank.md.
verify    — the gap measured with `Performance.getMetrics` and a long-task observer, video and trace off, three
            runs each; `docs/e2e/chat-agent-fit.spec.ts` still passes.
