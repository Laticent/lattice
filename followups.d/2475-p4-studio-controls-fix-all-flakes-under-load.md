---
origin: 2475
priority: P4
recorded: 2026-09-29
---

# `studio.controls.test.tsx` "Fix all" cell times out in a full docs vitest run

why now   — found while running the gates for plugin-system phase D's browser half: the cell
            `Studio — Architect + editor controls respond > "Fix all" clears an unknown component
            flagged inline` fails in a FULL `cd docs && npx vitest run` in the cloud sandbox —
            `Unable to find an accessible element with the role "button" and name "Fix all"`, a
            `findBy` running out of time — and passes when its file runs alone (62 of 62). Measured
            on `main` (84c4f4d) the same way, same result, so it is not that branch's; it is a
            load-sensitive wait that a busy runner loses.
where     — `docs/src/components/studio/studio.controls.test.tsx`.
done when — the cell waits on the condition that makes "Fix all" appear (the inline finding
            rendering) rather than on a default timeout, and a full run passes it three times in a row.
evidence  — three consecutive full `npx vitest run` passes in the sandbox.
verify    — self-review with the gates (a test-only change).
