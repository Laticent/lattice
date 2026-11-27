---
origin: 3463
priority: P1
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — 0 of 115 failures in this sandbox; #2988's box fails about 2 in 35, and a trace from there is promised
source: https://github.com/Laticent/lattice/pull/3463
---

# deck-drop-import.spec.ts:272 never finds the drop sign on desktop

why now   — red on main for #2988's session (session_01DPMMjEtGD1HsH8fMipw2ih): about 2 in 35 at --workers=1, and once in a
            full desktop shard. Each failure stops at :292 `expect(sign(page)).toBeVisible()`, "element(s) not found".
            The command center routed it under HARD RULE #33.
where     — docs/e2e/deck-drop-import.spec.ts:272, "the sign fits the screen…"; the sign's logic is
            docs/src/components/studio/deck-drop.ts (`deckDropVerdict`, `OWN_DROP_ZONES`).
measured  — 0 of 115 here: #2988's exact command at --workers=1 ×40 with traces, ×20 alone, ×10 at --workers=4, and
            the whole spec ×5. One theory is ruled out by a failing arm: the dark shot's reload racing hydration. With
            the Studio island's chunk held back 4 s it still passed, because Chromium keeps sending dragover while a
            drag is held, and the sign shows once the shell mounts. Left standing: the drag point lands on an owned
            zone (a dialog, .cm-editor or [data-file-drop]), so every dragover is refused.
done when — the failing shot and the element under the drag point are read from a trace, the cause is fixed, and
            the HARD RULE #34 runs pass.
evidence  — a retain-on-failure trace from #2988's box (promised after its load comparison).
verify    — tier 0 plus the #34 runs on desktop.
