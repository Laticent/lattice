---
origin: 3554
priority: P2
recorded: 2026-11-27
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-27-token-system-1-0.md §7.6
deferred: off-path — chart cycle length, not a spec change
source: https://github.com/Laticent/lattice/pull/3554
---

# A grouped bar or slope chart with more than six series drops series 7 and up from the slide, and lint is clean

why now   — Found by the Spec desk while measuring chart colors for the token-system design. The owner has been told it
            will be fixed. The first report said "repeats after 6"; rendering showed the series are DROPPED instead.
where     — `lib/plugins/chart-family/shared/cartesian.js:881` (`parseSeries`, `maxSeries = 6`) and `:933` (the slice);
            the colors at `lib/plugins/chart-family/kinds/bar/bar.transform.js:427` and `:815`/`:821` (`% 6`) and
            `kinds/slope/slope.transform.js:62` (`maxSeries: 6`), `:393`, `:443`, `:475`, `:727`. The cap is deliberate
            (the comment cites Wong 2011: six distinct hues), and `cartesian.js:930` says "truncating silently would
            DROP data, so the cap is reported and the member decides". The bar chart names the overflow only in its
            text description (`buildDesc`, `bar.transform.js:870`): nothing on the slide, no key entry, no lint finding.
            The theme curates 8 chart solids (`--chart-cat1`…`--chart-cat8`), so slots 7 and 8 are never painted here.
done when — the owner's chosen fix is built (2026-11-27, in the command center's question tool, typed confirmation
            pending: "Fold into 'Other' + warn"): series past six fold into ONE "Other" bar or line, the way
            `stacked-bar` already does (`stacked-bar.transform.js:744`), so no data disappears; and `lint:deck` warns
            the author which series were folded (a rule in `lib/authoring/lint-core.js`, HARD RULE #7). Both for the
            grouped bar and the slope chart.
evidence  — Repro deck (indaco, one slide): a `bar` slide with two groups (`Q1`, `Q2`), each with eight nested series
            `A` … `H` with numeric pills. Rendered with `dist/lattice.js` to HTML: the slide draws 12 bars (A–F twice) and
            a key of six; G and H appear nowhere. `npm run lint:deck` on it reports the file clean. (Spec desk scratch:
            `.scratch/tok/series8.md`, not committed.)
verify    — the repro deck before and after: an "Other" bar holding G and H (summed per group) plus a lint warning that
            names G and H (failing arm: no Other bar and no finding before the fix); the same for a slope chart with
            seven lines.
