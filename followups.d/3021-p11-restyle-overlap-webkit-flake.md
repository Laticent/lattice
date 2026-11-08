---
origin: 3021
priority: P11
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — found while checking #3088's e2e evidence; it fails on that PR's base (d1a4704) too, and the Studio restyle race is outside that diff
source: https://github.com/Laticent/lattice/pull/3088
---

# restyle-overlap reads two palettes alike in WebKit, one run in three

why now   — docs/e2e/restyle-overlap.spec.ts "an older render that finishes late does not take the frame back from a newer one" (webkit-phone) failed 1 of 3 runs on d1a4704 (`--repeat-each=3`) and once in a full run on #3088's branch: `the three palettes must look different to tell them apart (light-dark(#006FA8, #82C8E5) light-dark(#7A5A10, #C8A040) light-dark(#7A5A10, #C8A040))` at line 79. The second and third samples read the same palette, so a sample is taken before the newer restyle lands: a wait on a duration or on the wrong signal (HARD RULE #32, shape F1 or F3).
where     — docs/e2e/restyle-overlap.spec.ts:60-80, the three palette samples.
done when — the spec waits on the frame's own restyle signal before each sample and passes 20 of 20 with `--repeat-each=20` on webkit-phone.
evidence  — the `--repeat-each=20` run log.
verify    — cd docs && npx playwright test e2e/restyle-overlap.spec.ts --project=webkit-phone --repeat-each=20 --trace off
