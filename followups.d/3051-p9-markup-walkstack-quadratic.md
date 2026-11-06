---
origin: 3051
priority: P9
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §5
deferred: off-path — pre-existing in docs/src/lib/markup, which #3051 does not touch
source: https://github.com/Laticent/lattice/pull/3051
---

# Unclosed raw HTML renders in quadratic time through docs/src/lib/markup

why now   — the #3051 red-team pass timed `'<div>\n'` repeated N times through the docs-site markup path: 4k lines 230 ms, 8k 862 ms, 16k 3.9 s, 32k 16.1 s (`x <b>` x16k: 1.4 s). markdown-it alone takes about 8 ms on the same inputs. The Studio renders shared and AI-generated decks, so a pasted deck can hang a viewer's tab (HARD RULE #22's threat model).
where     — docs/src/lib/markup, `walkStack` and its `lastIndex` handling.
done when — the four inputs above render in linear time through the markup path, and a test asserts it by work count, not by the clock (HARD RULE #32).
evidence  — the timings above, before and after.
verify    — tier 1 checker; it sits upstream of the preview sanitizer.
