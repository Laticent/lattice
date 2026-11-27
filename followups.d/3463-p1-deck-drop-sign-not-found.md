---
origin: 3463
priority: P1
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — 0 of 170 failures across two sandboxes (55 more on 2026-11-27, under load and 6x CPU throttle); #2988's box fails about 2 in 35, and the witness committed on 2026-11-27 names the cause on its next failure
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
measured 2026-11-27 (fix session session_015KSkL6V2LucFf47b2qR3hF, 4 cores, 15 GB, branch fix/3463-deck-drop-sign):
            0 of 55, all in the desktop project with `E2E_PREBUILT=1`.
            · `-g "the sign fits" --workers=1 --repeat-each=30` with 3 CPU burners (a `while :; do :; done` per core) and
              a gecko run alongside: 29 of 29. The 30th was red with ENOENT on its trace file because my concurrent
              gecko run cleaned `test-results/`; give a concurrent run its own `--output`.
            · the whole spec, `--workers=1 --repeat-each=6`, 3 burners: 54 of 54 (the sign arm 6 of 6).
            · the sign arm at `Emulation.setCPUThrottlingRate` 6 (a scratch copy set it in `beforeEach`), 3 burners,
              `--repeat-each=20`: 20 of 20.
            · `document.elementFromPoint` at the drag point, sampled 20 times at each shot size after the resize: the
              header itself at 1440 and 390, a mode-switch button inside the header's `<fieldset>` at 820. Never an
              owned zone.
corrected — "Chromium keeps sending dragover while a drag is held" is wrong. A CDP drag gets exactly the one `dragover`
            the test dispatches: the witness logged one in 5 s, accepted or refused. The test gets one chance, so
            anything that sits under the point at that moment, however briefly, fails it. A user's real drag sends
            `dragover` about every 350 ms and would get the sign back. The hydration theory is still ruled out, and
            the reason is now known: the islands are `client:only`, the page has no static `<header>`, and
            `nativeDrag`'s `header.boundingBox()` waits for the element, so the drag starts only after the shell has
            mounted (an arm holding both StudioIsland chunks 8 s on the dark reload passed, and the one `dragover` was
            accepted).
witness   — committed with this note: the sign arm logs every file `dragover` from a window listener (target, owned
            zone, inside `[data-studio-root]` or not, `defaultPrevented`, `dropEffect`). A failed sign check throws
            with that log, what `elementFromPoint` finds at the drag point and every open dialog. The next red run
            reads one of four shapes, and a failing arm (a scratch copy, deleted after) turned each one red with
            its own text:
            · no `over` line: Chromium delivered no dragover (arm: send only `dragEnter`; "dragover log (0)");
            · `owned=<zone>`: a zone that owns drops is under the point (arm: a `role="dialog"` over the header;
              `owned=div[role=dialog]`, `defaultPrevented=true dropEffect=none`);
            · `inStudioRoot=false`: something outside the shell is on top (arm: a plain `<div>` on `<body>` over the
              header; `under: div#arm-outside`, `defaultPrevented=false`);
            · an accepted `over` and still no sign: the render never left the sign in the DOM (arm: a
              MutationObserver removing it; `defaultPrevented=true dropEffect=copy`).
done when — a failure's witness names the cause, the cause is fixed, and the HARD RULE #34 runs pass.
evidence  — the witness's error text from a red run on #2988's box or the nightly.
verify    — tier 0 plus the #34 runs on desktop.
