---
origin: 2988
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-16-blessing-invariants-attribution.md
deferred: blocked — owner, 2026-11-22: "Dispatch bless_held + follow-up", over changing the blessing verdict inside #2988. The verdict is an invariant the owner set on 2026-11-16, so the change is the fit desk's to propose, not this PR's.
source: https://github.com/Laticent/lattice/pull/2988
---

# The nightly bless holds goldens whose page count the measured split moved

why now   — #2988 makes the measured split the default for every square, portrait and story deck, so a golden's
            page count follows measured heights: font metrics, the Chrome build, a theme's spacing. The nightly
            bless holds any golden whose page change its slide change does not explain
            (tools/lib/golden-bless-verdict.mjs `slidesExplainPages`), and a held golden turns the night red. The
            first night after the merge will hold many of the ~60 non-16:9 example goldens (expected; the owner
            dispatches `bless_held` once). After that, a font or Chrome update can hold some again with no source
            change. Found by the inversion review of #2988 (2026-11-22).
where     — tools/lib/golden-bless-verdict.mjs `slidesExplainPages`, tools/golden-bless.mjs, .github/workflows/golden-bless.yml;
            the split pages are stamped `data-split-role` / `data-lattice-slide="N.k"` (lib/core/auto-split.js)
done when — the bless verdict explains a page delta by the split pages of the authored slides that changed (count
            `data-split-role` sections per authored slide, or compare a plan digest), so a golden whose authored
            slides are unchanged and whose extra pages are all split pages of them is blessed or reported as a split
            change rather than held; a test holds a measured repack that changes pages without a source change.
