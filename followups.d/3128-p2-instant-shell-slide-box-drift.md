---
origin: 3128
priority: P2
recorded: 2026-11-10
area: website
severity: low
swimlane: engineering/decisions/2026-11-10-compose-first.md §5
deferred: off-path — fails identically on main; PR #3128 does not touch the preview's geometry
source: https://github.com/Laticent/lattice/pull/3128
---

# The instant shell's slide box is 3-4 px narrower than the app's in two cases

why now   — `studio-instant-shell.spec.ts` "the instant shell frames the app" fails in two cases, on
            `main` as well as on #3128: "1440x900 @ write (editor collapsed to its 46px rail)" measures
            shell 1207 vs app 1211, and "390x844 @ write (rotated while the engine was still loading)"
            measures shell 301 vs app 304, against a 2 px tolerance. The spec is nightly, so nothing
            gates on it.
where     — docs/src/pages/studio.astro (the seed's preview geometry) vs the app's preview pane;
            docs/e2e/studio-instant-shell.spec.ts:251.
done when — both cases pass on a real `build:e2e`, with the tolerance unchanged.
evidence  — reproduced 2026-11-10 by checking out main's docs/ sources in place and running
            `npx playwright test e2e/studio-instant-shell.spec.ts --project=desktop -g "rotated while the engine|collapsed to its 46px"`.
verify    — the same command, on a fresh build.
