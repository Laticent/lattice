---
origin: 2687
priority: P3
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2687
---

# library-image-metadata.spec.ts:598 times out on the Images tab, on PRs that do not touch the Library

why now   — studio-smoke failed twice on 2026-10-14 on PRs that touch neither the Library nor the spec: the merge
            queue for #2686 (docs only, run 38565116309) and #2687's first run (run 38567476353). Both time out at
            line 616, `getByRole('tab', { name: 'Images' })`, 15 s, after the spec's fallback click on the Library
            button. #2686 merged on a later run, so it is intermittent. It arrived with #2668 (photo metadata), and
            #2672 (a Videos shelf) has since changed the Library's tabs, which may move it either way.
where     — docs/e2e/library-image-metadata.spec.ts:598-620 (the "Use new name" quota test and its tab-opening
            preamble), docs/e2e/studio-fixture.ts (`CHROME.library`).
done when — the spec opens the Images tab the way the other Library specs do (a shared helper that waits for the
            Library panel to mount before asking for the tab), and it passes `--repeat-each=20 --retries=0` locally.
evidence  — the two job logs above; the failure screenshot in the run's `studio-smoke` artifact.
verify    — tier 0 gates, plus the repeat run.
