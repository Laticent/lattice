---
origin: 2743
priority: P1
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# Finish the npm-plugin canary harness: the export check and the data-return case.

Triaged 2026-10-18: the locked-page half is built (`test/integration/export/npm-plugin-canary.test.js`, canary in
`test/fixtures/npm-plugin-canary.js`). Two parts of the note's §5.2 remain, and each waits on something that is not
this test's to supply.

why now   — phase G (the npm door) must not open until both are green. Decided 2026-10-17 (note §6): the harness is a
            hard exit criterion, in the integration tier, with no new CI job.
where     — test/integration/export-nightly/npm-plugin-export-check.test.js (built, marked `todo`),
            test/integration/export/npm-plugin-canary.test.js (the `DATA RETURN` test, marked `todo`).
done when — (1) the export check loses its `todo` and reads zero in Chromium, WebKit and Firefox on both the
            `--player` and the plain export. It cannot pass until follow-up 2749-p2 closes navigation,
            `window.open`, WebRTC and the plain export's script, frame, stylesheet and meta-refresh loads; it must
            not pass by accepting an exit. (2) The `DATA RETURN` test is real: it needs the host's data-return
            surface and its detect-and-disable path (follow-up 2749-p4), then hands the host a script, an event
            handler, a `javascript:` link, a `</style>` break-out and oversized values, and checks the host drops
            them, disables the plugin and alerts the user. (3) DONE 2026-10-18 on the owner's instruction: the export check runs nightly (`test/integration/export-nightly/`),
            and integration-nightly.yml installs Playwright's WebKit and Firefox and sets `LATTICE_PLAYWRIGHT`.
evidence  — the export check output for the six cells with each cell's control reaching the listener; the data-return
            test red with a limit removed and green with it.
verify    — tier 2 trio, because it is the security gate for outside code.
