---
origin: 2612
priority: P2
recorded: 2026-10-08
area: docs
severity: medium
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: https://github.com/Laticent/lattice/pull/2612
---

# Move LTT's spec into spec/LTT-1.0.md, publish it, and give the home page a Specs group

why now   — spec audit §6 step 2. LTT is the most complete spec but lives in engineering/ltt.md
            and is filed as a library; this gives specs their public home. Spec audit §8.5
            records the owner's direction that LTT is presented as a spec, which settles library
            audit §6.2.
where     — engineering/ltt.md → spec/LTT-1.0.md (with Owner, Status and a change log, CC-BY-4.0);
            tools/build-spec-docs.js SPECS; docs/src/lib/nav.mjs (LTT out of librariesNav, into a
            specs list, keeping nav.test.ts's workspace check honest: @laticent/ltt stays a
            published package); docs/src/pages/index.astro (a Specs group beside #libraries).
done when — /spec/ltt/ is live, docs:spec:check covers it, and the home page shows LTT under Specs.
evidence  — tools/screenshot.js at 1440, 820 and 390 of the home page and /spec/ltt/.
verify    — tier 0 gates plus the QUALITY BAR visual review; no engine change.
