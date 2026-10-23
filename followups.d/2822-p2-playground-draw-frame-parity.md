---
origin: 2822
priority: P2
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-22-preview-baseline-oct-8-vs-frame.md
---

# Prove the Playground draws and holds diagrams the way the Studio does.

why now   — the owner wants the Playground to do what the Studio does. Both install the draw host
            (`load-engine.ts`) and warm it (`render-engine.ts`), and the runtime is shared, but nothing drives
            the Playground's frame: the flash bench and `draw-frame-preview.spec.ts` are Studio-only. UNVERIFIED.
where     — docs/scripts/diagram-flash-bench.mjs (add a `--surface playground` arm); docs/e2e/draw-frame-preview.spec.ts.
decided   — the Studio's rules are the target: first diagram tagged at once, 0 source and 0 blank frames on
            an edit, the previous diagram held, no Mermaid library loaded into the page.
done when — the bench and one e2e (Chromium, Firefox, WebKit) run on `/playground/` and match the Studio's rows.
evidence  — the table in the baseline note, with a Playground column.
verify    — none beyond the gates.
