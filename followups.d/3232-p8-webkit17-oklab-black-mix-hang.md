---
origin: 3232
priority: P8
recorded: 2026-11-20
area: engine
severity: high
swimlane: engineering/decisions/2026-11-16-status-triplets.md §4
deferred: off-path — the hang is in hub-spoke's status label on onyx, outside the four guarded rules and the icon inks this PR fixes; the fix is either onyx's brand black or an engine-wide mix pattern, both larger than this PR
source: https://github.com/Laticent/lattice/pull/3232
---

# Safari 17.5-17.6 hangs on a hub-spoke `blocked` satellite under onyx's light face

```text
  P8 · [no ticket] WebKit 17.4 hangs on an oklab color-mix of two light-dark() pairs with a pure black arm
       why now   — Found measuring hub-spoke icon inks in Playwright 1.44's WebKit 17.4 (P1 of the status-triplets
                   continuation). A hub-spoke slide with one `blocked` satellite on onyx's light face never finishes
                   its first frame; the same slide on onyx-dark, carbone, or with `at-risk` or `on-track` renders in
                   about 0.4 s. Same result on main (a96bb67's CSS), so this PR did not cause it.
                   Minimal repro, one element on a page with `color-scheme: light dark`:
                     color: color-mix(in oklab, light-dark(#940018, #dd7878) 62%, light-dark(#000, #fff))  → HANG
                   and each of these renders: either arm a plain color instead of light-dark(); `#111` for `#000`;
                   `in srgb` for `in oklab`. The hub-spoke rule is `.hub-spoke-status { fill: color-mix(in oklab,
                   var(--hs-state-ink, …) 62%, var(--text-heading)) }`: blocked's --hs-state-ink is onyx's
                   `--fail-edge-mark: light-dark(#940018, var(--fail))`, and onyx's --text-heading is
                   `light-dark(#000000, #FFFFFF)`, the one pure black heading among the palettes.
       where     — lib/plugins/chart-family/kinds/hub-spoke/hub-spoke.styles.css .hub-spoke-status; any other
                   `color-mix(in oklab, <light-dark token>, var(--text-heading))` an onyx slide reaches; or onyx's
                   heading black in themes/onyx/onyx.css.
       done when — a survey in WebKit 17.4 lists every rule that mixes two light-dark() tokens in oklab with a pure
                   black arm, and each renders there (for example mixed `in srgb`, or with a heading of #010101,
                   which is the brand call), with every gallery and example deck on onyx light loading in WebKit 17.4.
       verify    — the repro above, then each onyx deck through a load-and-screenshot in WebKit 17.4.
```
