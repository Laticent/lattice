---
origin: 2523
priority: P3
recorded: 2026-10-05
area: infra
severity: low
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2523
---

# The cold-sheet slide-in test misses the shell's slide under parallel load

`docs/e2e/panel-shells.spec.ts` › "a cold sheet slides in once, even when its code arrives
mid-slide" polls for a running animation on the loading shell before it releases the held chunk.
Under 4 Playwright workers the poll can miss the 500 ms slide, and the test fails at that poll
(`expect.poll(... some running animation ...).toBe(true)`). Measured on 2026-10-05, desktop and
mobile projects, `--repeat-each=8 --workers=4`: 1 of 16 failed on main (f73625a), and 2 of 16 on
#2523's branch. Serially, `--workers=1`, all 16 passed on the branch. The failing step runs before
the real Share sheet mounts, so the change in #2523 is not in its path.

```text
why now   — low: it surfaces only when the e2e tier runs loaded, but a red nightly costs a triage.
where     — docs/e2e/panel-shells.spec.ts (the slide-in poll before `hold.release()`).
done when — the test arms its release on a signal that cannot be missed (an `animationstart`
            listener installed before the click, say) and passes 32/32 at --workers=4.
evidence  — the repeat run above, before and after.
verify    — tier 0: the spec at --repeat-each, loaded and serial.
```
