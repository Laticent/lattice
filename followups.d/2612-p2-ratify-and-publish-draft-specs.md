---
origin: 2612
priority: P2
recorded: 2026-10-08
area: docs
severity: medium
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: engineering/decisions/2026-10-08-spec-audit.md §8
---

# The owner signs off LFM 1.1, the theme contract and the .lattice file, then they go on the site

why now   — all three are written, each with shared test cases that run in the unit tier, and each
            is marked "Draft, for the owner's sign-off", because the owner signs off every change to
            a public spec's meaning (spec audit §8.3). The repo keeps a draft spec off the site
            (spec/README.md, as LPM), so none of the three is published yet.
where     — spec/LFM-1.1.md, spec/THEME-1.0.md, spec/LATTICE-FILE-1.0.md (status line and change log);
            tools/build-spec-docs.js SPECS; docs/astro.config.mjs Specification sidebar;
            docs/src/lib/nav.mjs specsNav (the home page's Specs group).
done when — each is ratified with an owner line, projected to /spec/<slug>/, listed in the sidebar and
            the home page's Specs group, and docs:spec:check covers it.
evidence  — tools/screenshot.js at 1440, 820 and 390 of each new page.
verify    — the owner's sign-off; tier 0 gates for the projection.
