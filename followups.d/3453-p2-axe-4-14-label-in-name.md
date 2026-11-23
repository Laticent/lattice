---
origin: 3453
priority: P2
recorded: 2026-11-23
area: website
severity: medium
swimlane: docs/e2e/axe-site.spec.ts
deferred: off-path — the defects predate #3453; it only pins the axe the sweep was validated on, and the fixes touch site chrome, the playground and the Studio
---

# axe-core 4.14 finds label-in-name gaps the 4.12 sweep cannot see

`docs/e2e/axe-site.spec.ts` loads `axe-core` from `docs/node_modules`. Until #3453 nothing declared it: the sweep got the
copy Lighthouse hoisted, and #3201's lhci 0.16 bump moved that from 4.12.1 to 4.14.0, which turned the sweep red. #3453
declares `axe-core` 4.12.1 so the sweep runs on the axe it was validated with. Under 4.14 the desktop sweep reports
`label-content-name-mismatch` (WCAG 2.5.3, the visible label is not in the accessible name) on about 11 elements, in
both color modes: the header button matched by `.has-[>svg]:px-3` on every page, the playground's `.w-44` control and
`Previous slide`, and in the Studio `.xl:px-3`, `.cs-fmt-btn`, two Radix triggers and the `button[data-unit="0"…"6"]`
row. Tablet and mobile were not measured under 4.14.

done when — `axe-core` is raised to 4.14 or later in `docs/package.json`, every finding is fixed (each accessible name
            contains its visible text), `axe-site.spec.ts` passes at desktop, tablet and mobile, and the `axe-core`
            `ignore` entry under `/docs` in `.github/dependabot.yml` is removed.
evidence  — the sweep's output under 4.14 before and after, at all three widths.
verify    — tier 0: self-review with the gates, plus the e2e run at three widths.
