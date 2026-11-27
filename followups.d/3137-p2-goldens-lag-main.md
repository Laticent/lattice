---
origin: 3137
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-16-blessing-invariants-attribution.md
deferred: off-path — logged from a session archive sweep; the nightly bless is not touched by the PR that records it, and re-blessing goldens belongs to the bless workflow
source: https://github.com/Laticent/lattice/pull/3137
---

# Some committed PDF goldens lag main: check the old bullet-less ink and the ones the bless skips

why now   — #3137 put list markers back in the vector PDF and said the committed goldens would show the old
            bullet-less ink until they were re-rendered. Checked on main (164ecfa), 2026-11-22: 16 of 649 tracked
            PDFs were last changed before #3137. Five of them have Markdown lists in their source. I rendered those
            five on main and compared pages at 40 dpi:
              claim-hero-header  0 pages differ
              panes-sketch       4 differ, the sketch finish's jitter only (looked at page 2)
              logo-finish        2 differ;  split-tone-edge-story 9 differ (not inspected)
              social-grid        9 differ. Page 3 is visibly stale: the eyebrow is mono caps in the golden and
                                 italic serif on main, and the "on plan" pill is a darker green.
            No missing marker was seen on the pages inspected, so the bullet half looks done. But social-grid
            shows a golden the nightly bless has not caught up with.
where     — examples/social-grid.pdf, examples/split-tone-edge-story.pdf, examples/logo-finish.pdf; the bless's
            drift check (tools/golden-bless.mjs, `regression-gate.mjs --scope all`); the other 11 old PDFs,
            under engineering/decisions/, examples/chart-theme-gallery/ and kit/.
done when — each of the 16 PDFs is either re-blessed or named as frozen on purpose, and the reason the bless
            skipped social-grid is known.
evidence  — the comparison above. The renders live in the session's scratchpad only.
verify    — `node tools/regression-gate.mjs --scope all --json` names each of the 16 as drifted or clean; compare pages again.
