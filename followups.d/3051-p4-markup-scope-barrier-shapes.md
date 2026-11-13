---
origin: 3051
priority: P4
recorded: 2026-11-10
area: website
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §5
deferred: large — a linear answer needs the nearest scope barrier per stack entry, which the AAA splice invalidates; a redesign of walkStack's scope lookups, not a guard
---

# Five unclosed-HTML shapes under a scope barrier still walk in quadratic time in docs/src/lib/markup

```text
  P4 · [no ticket] the scope-barrier shapes the per-name counts do not cover (five)
       why now   — the 2026-11-10 fix (`walkStack` keeps a count of open elements per name and
                   skips a scan whose target is not open) made the four inputs in 3051-p9 linear:
                   `<div>\n` x32k 10.9 s → 24 ms. Two shapes still scan past a deep stack because
                   their target IS open, under a scope barrier:
                     '<p><object>' + '<div>' x N               4k 76 ms, 8k 231 ms (3.0x)
                     '<div><object>' + '<span>' x N + '</div>' x N   4k 56 ms, 8k 199 ms (3.5x)
                   The independent checker found three more of the same cause (a scan that stops at
                   a scope barrier or an integration point), each 4.00x in work per doubling:
                     '<svg><foreignObject>' + '<div>\n' x N   16k 1.7 s
                     '<math><mi>' + '<b>' x N                  16k 1.3 s
                     '<p><button>' + '<div>' x N               16k 1.0 s
                   The first is not exotic: the runtime itself writes `<foreignObject>`, so a pasted
                   SVG with HTML labels can reach it. Each costs seconds at 16k lines, not minutes.
       where     — docs/src/lib/markup/tags.ts `walkStack`: the paragraph-close scan, the foreign
                   break-out scan (it stops at an integration point) and `outOfScope`.
       done when — all five shapes walk in linear time, held by `stackVisitsFor` in
                   tags-linear.test.ts (add them to SHAPES).
       evidence  — the two timings above, before and after.
       verify    — tier 1 checker; it sits upstream of the preview sanitizer.
```
