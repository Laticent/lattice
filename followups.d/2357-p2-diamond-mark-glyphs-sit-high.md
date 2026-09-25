---
origin: 2357
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2357
---
# `!` and `?` in a `:diamond` pill sit about 0.3–0.4px high

why now   — the diamond is the decision mark, and `!` / `?` are the labels it most often
            holds. Pills center on the font's CAPITALS (`text-box` trims to cap height), and
            Outfit draws `!` and `?` taller than its capitals, so their ink center sits above
            the box center. Measured in PR #2357: Chromium 141 −0.44px mean, WebKit −0.30px,
            Firefox −0.14px at body size.
where     — lib/base/base.modifiers.css § Inline pills, the `.lat-pill[data-shape='diamond']`
            rule; any nudge must hold at `:sm`, body and `:lg`, and in `mode: sketch`
            (Shantell Sans).
done when — the ink-diff probe from PR #2357 reads ≤ 0.2px for `{!}:diamond` and
            `{?}:diamond` in Chromium, Firefox and WebKit, with digits (`{3}:diamond`,
            `{12}:diamond`) no worse than today.
evidence  — the probe table before and after, and a zoomed render of the demo deck's
            diamonds (examples/inline-pills.md slide 5) via SendUserFile.
verify    — tier 0 gates plus the probe. The change stays inside one shape rule, and the
            probe is the regression check.
