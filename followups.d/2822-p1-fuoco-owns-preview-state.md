---
origin: 2822
priority: P1
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-22-preview-baseline-oct-8-vs-frame.md
---

# Explore Fuoco as the one owner of preview state, and the decoupling it allows.

why now   — the owner wants to manage and distribute state through focus, decouple the stages and process in
            parallel. After #2822 an edit passes through the editor, a 200 ms pipeline, a 150 ms debounce, the
            runtime pass and a sandboxed frame, and no single place knows what is on screen and what is stale.
where     — docs/src/lib/playground-sync.ts and docs/src/lib/fuoco; the Studio's preview wiring in
            docs/src/components/studio/StudioShell.tsx and single-slide-render.ts.
progress  — 2026-10-23: engineering/decisions/2026-10-23-fuoco-owns-preview-state.md names the axes, prices designs A/B/C and
            recommends A then C. Waiting on the owner's pick; nothing built.
decided   — nothing. This is "rethink X": per CLAUDE.md, write the design model first (axes, candidate moves,
            a recommendation) and confirm it in one `AskUserQuestion` round before editing code.
done when — a decision note names the axes (who owns focus, what is stale, which stages may run in parallel),
            prices at least two designs against the 2026-10-22 baseline table, and the owner picks one.
evidence  — the same flash bench, same arms, against the baseline note; nothing worse than the Oct 8 column.
verify    — tier 2 trio if it adds a thread or frame boundary.
