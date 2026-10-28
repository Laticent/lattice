---
origin: 2937
priority: P2
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md
source: https://github.com/Laticent/lattice/pull/2937
---

# `playground-focus-sync` "a click on a line in the editor… leaves the editor alone" flakes on WebKit

why now   — found while running the WebKit and Firefox projects on PR #2937. On the `webkit-tablet` project the editor's
            scroll moves 136px after the click (`Expected: < 2, Received: 136`) in a good share of runs. It is not from
            #2937: the same spec on a build of `992664b` (the base) failed on at least 3 of 8 repeats
            (the output was cut after the third failure). The order of events around the click decides it, not the time since load:
            waiting 150ms before the click made it pass once in a debug spec, and waiting for 12 or 30 calm frames did not.
where     — docs/e2e/playground-focus-sync.spec.ts:206; the editor-follows-preview rule in docs/src/lib/playground-sync.ts
            (`drivenByPreview`, `isEcho`, the 120ms `ECHO_MS` window). A click centers the preview; when that scroll event is
            not recognized as the sync's own echo, the editor follows the preview by 136px.
decided   — nothing. Root-cause the echo test on WebKit before touching the spec.
done when — the spec passes 20 of 20 on `webkit-tablet` in a fresh `build:e2e`, or a decision note names why WebKit
            reports the scroll outside the window and what the sync does about it.
evidence  — the 20-run result before and after; the echo's timestamps for a failing run.
verify    — tier 1 self-review with the gates.
