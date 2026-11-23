---
status: shipped
summary: >
  Moving the docs perf nightly from Lighthouse CI 0.15 (Lighthouse 12.6) to 0.16 (Lighthouse 13.6) changes the numbers
  it reports for the same build: TBT goes up 30–110% on the script-heavy pages, LCP goes down by up to two thirds where
  the largest paint is text, and accessibility, SEO and the report files stay the same. Measured on one served build,
  the two versions alternating per URL, 5 runs each. The nightly verdict stays consistent because both of its arms are
  measured by the head checkout's lhci, so the version change cannot read as a regression. Night-over-night readings
  of issue #2085 can, so read across the change date with this note in hand.
---

# Lighthouse 13: the same build, different numbers (2026-11-22)

`docs/package.json` moved `@lhci/cli` from `^0.15.1` to `^0.16.1`, which carries Lighthouse from 12.6.1 to 13.6.0. The
change touches only the tool. This note records what that tool change alone does to the nightly's numbers, so a step
in the history of issue #2085 on the merge date is not mistaken for a site regression.

## What the release notes say

lhci 0.16.0's breaking changes are two lines: "upgrade to lighthouse 13.6.0" and "minimum supported node is now 22"
(Lighthouse 13 itself asks for 22.19). None touches the `ci.collect` keys our two configs use, the
`temporary-public-storage` upload target, or the `assert` presets (our configs carry no `assert`). Lighthouse 13 removes
the audits its performance "insights" replaced, and the empty `first-meaningful-paint`. The four values
`scripts/perf-regression.mjs` reads (`categories.performance.score`, `largest-contentful-paint`,
`cumulative-layout-shift`, `total-blocking-time`) are all still present in every report.

## How it was measured

One `astro preview` of one build on `:4399`. For each of the five URLs in `lighthouserc*.cjs`, five rounds, each round
running lhci 0.15 (a `main` worktree) and lhci 0.16 (this branch) once, the order flipped every round. Both arms used
the same collection settings. This is the nightly's own interleaving (2026-11-08 note §2), applied to the tool instead
of the build. A sequential run (all 0.15, then all 0.16) was taken first and discarded as evidence: Lighthouse's own
CPU benchmark index moved from 1,324 to 2,387 across it, which swamps a tool difference.

## Medians, 5 runs per arm

| form · page | perf | a11y | best-pr. | SEO | LCP ms | TBT ms | CLS |
|---|---|---|---|---|---|---|---|
| desktop / | 95 → 96 | 100 → 100 | 96 → 96 | 92 → 92 | 757 → 293 | 171 → 168 | 0 → 0 |
| desktop /components/ | 99 → 100 | 100 → 100 | 96 → 96 | 92 → 92 | 978 → 326 | 0 → 0 | 0 → 0 |
| desktop /getting-started/ | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 720 → 284 | 0 → 0 | 0 → 0 |
| desktop /playground/ | 94 → 89 | 100 → 100 | 96 → 96 | 92 → 92 | 1165 → 1173 | 102 → 215 | 0 → 0 |
| desktop /studio/ | 70 → 65 | 100 → 100 | 96 → 96 | 91 → 91 | 3403 → 3459 | 220 → 317 | 0.073 → 0.073 |
| mobile / | 69 → 74 | 100 → 100 | 96 → 96 | 92 → 92 | 3132 → 1061 | 1219 → 1594 | 0 → 0 |
| mobile /components/ | 81 → 99 | 100 → 100 | 96 → 96 | 92 → 92 | 4597 → 1358 | 114 → 122 | 0 → 0 |
| mobile /getting-started/ | 94 → 96 | 100 → 100 | 100 → 100 | 100 → 100 | 2862 → 2858 | 23 → 30 | 0 → 0 |
| mobile /playground/ | 48 → 55 | 100 → 100 | 96 → 96 | 92 → 92 | 5002 → 4540 | 1248 → 1753 | 0 → 0 |
| mobile /studio/ | 35 → 47 | 100 → 100 | 93 → 96 | 91 → 91 | 9074 → 5870 | 2216 → 2996 | 0 → 0 |

- **Accessibility, SEO and CLS do not move.** Best practices moves on one row, mobile `/studio/` 93 → 96, because
  Lighthouse 13 dropped the `font-size` audit, which was the only other audit failing there.
- **LCP drops where the largest paint is text.** On `/components/` both versions name the same LCP element (the
  "80 components…" lede) and time it about 3.2 s apart on mobile. Lighthouse 13 takes LCP from its trace engine.
- **TBT rises on the script-heavy pages** (`/playground/`, `/studio/`, mobile `/`), by 30–110%.
- **Reports are the same pair**, `lhr-<id>.json` and `lhr-<id>.html` per run. 0.16 adds a suffix to `<id>`
  (`lhr-1795389857010-669544.json`). `perf-collect.mjs` matches `lhr-*.json`, so it still finds them, and a full
  `perf-collect.mjs` run on 0.16 wrote all 40 reports. Each report carries 161 audits instead of 175, and a fifth
  category, `agentic-browsing`, which the compare does not read.

## What it means for the nightly

- **The verdict stays consistent across the change.** `perf-collect.mjs` measures the base build with the head
  checkout's `npx lhci`, so on every night both arms use one Lighthouse. Run as the nightly would, comparing 0.16
  against 0.15 on the same build flags four TBT rows. That is exactly the comparison the nightly never makes.
- **The bands were tuned on Lighthouse 12.** TBT is now larger in absolute terms, so the 100 ms noise floor filters out
  relatively less, and mobile `/playground/` moved from just under the 0.5 score floor (0.48) to just over it (0.55),
  where a noisy night can cross it. The tolerances are unchanged here on purpose. Retune them only from nights measured
  on Lighthouse 13.
