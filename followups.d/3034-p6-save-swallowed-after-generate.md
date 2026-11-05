---
origin: 3034
priority: P6
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §3
deferred: off-path — the Component faculty's save (docs/src/components/studio/Fabricate.tsx), which PR 3034 does not touch; found when studio-smoke failed on that PR
---

# A Save clicked right after a component generate lands can do nothing

studio-smoke failed on PR 3034 at `9fb0f3d` (run 41951781635) in `docs/e2e/library-reopen-generate.spec.ts:116`. Its trace gives the
timeline: the mocked model's reply lands at 621.35 s, the name field reads `pricing-trio` at 621.46 s, Playwright clicks an
enabled Save at 621.48–621.61 s, and then for 15 s there is no save, no "Saving…" label, no success notice and no error notice.
The failure screenshot still shows the unsaved dot next to `.pricing-trio`. `saveToLibrary` (Fabricate.tsx about line 724)
notifies on every path but one, `if (!canSave) return`, so `canSave` was false in the handler while the button the browser saw
was enabled. The generate's apply step (about line 580) sets the editing id, name, description, CSS, skeleton and manifest in
separate state updates, so the click may have run a handler from a render between them. A person who clicks Save right after a
generate could lose the click the same way, with nothing on screen to say so.

Not reproduced locally: 12 of 12 passes at 4 workers. The trace and the page snapshot are in the run's `studio-smoke-41951781635`
artifact (expires 2026-11-12).

done when — Save right after a generate either saves or says why not (a test clicks Save in the same tick the generate's result
lands and sees "Saved"), and the spec is green on 20 repeated runs.
