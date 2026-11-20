---
origin: 3232
priority: P5
recorded: 2026-11-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-16-status-triplets.md §4
deferred: off-path — four relative-color rules in hub-spoke, topic and base.modifiers that #3312 does not touch
source: https://github.com/Laticent/lattice/pull/3312
---

# Four more relative-color rules paint black in Safari 17.5-17.6

```text
  P5 · [no ticket] guard the remaining relative-color rules for WebKit 17.x
       why now   — #3312 found that WebKit 17.4 (Safari 17.5-17.6) parses relative color and
                   light-dark() but drops a relative color whose origin holds a light-dark()
                   token, so the value computes to nothing (black for color/fill, none for
                   stroke). It fixed the picked-ink guard (SUPPORTS in tools/build-marks-css.js
                   and tower's copy). Its code review found the same failure in rules it does
                   not touch, measured in Playwright 1.44's WebKit 17.4 (WebKit 26 is fine):
                     - lib/plugins/chart-family/kinds/hub-spoke/hub-spoke.styles.css:205, the
                       icon ink (`oklch(from var(--…) calc(l * 0.55) c h)` over a light-dark()
                       token): the icon likely goes undrawn.
                     - lib/components/anchor/topic/topic.styles.css:161
                     - lib/base/base.modifiers.css:385 and :550, which also fail on a literal
                       origin because WebKit 17.4 rejects `calc(h + 34)` in a hue channel.
       where     — the four rules above, and their @supports guards (or lack of one).
       done when — each rule sits behind a guard whose condition is the rule's own shape over a
                   light-dark() origin (as SUPPORTS now is), so WebKit 17.x takes the plain
                   value; or the rule is rewritten into a form WebKit 17.4 computes. Verified
                   by computing each property in WebKit 17.4 and in a current engine.
       verify    — Playwright 1.44 WebKit 17.4 needs libicu70 and libvpx7 from Ubuntu 22.04 in
                   its own minibrowser-wpe/sys/lib; then getComputedStyle on each rule.
```
