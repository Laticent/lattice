---
origin: 2674
priority: P3
recorded: 2026-10-14
area: theming
severity: low
swimlane: engineering/decisions/2026-08-18-split-frame-edge-ownership.md
source: https://github.com/Laticent/lattice/pull/2674
---

# Confirm the split-page tone rail in Studio and across the 70 galleries the PR render cap skipped

```text
why now   — #2674 merged at confidence `high`, with two reachable surfaces not driven: the 70
            galleries over the per-PR render cap (40) and the Studio preview. Neither touches the
            core claim; both could show an unexpected change from a rule in shared CSS.
where     — the nightly bless (renders every gallery), and the Studio preview of
            examples/split-tone-rail-story.md at `size: story`. The rules are in
            lib/base/base.variants.css (the `data-split-mods` arms) and lib/base/base.finish.css.
done when — the nightly bless commit shows no unexpected pixel change in the galleries under
            `lib/`, and a Studio screenshot of the demo deck shows the rail on the cover and body
            pages. Anything unexpected is a window #2674 created (HARD RULE #18): fix it here.
evidence  — the nightly bless diff (`git log -p` on the committed goldens) and a
            `tools/screenshot.js` capture of the Studio preview at 1440, 820 and 390.
verify    — tier 0 gates, because this item only observes; a fix it finds earns its own tier.
```
