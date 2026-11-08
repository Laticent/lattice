---
origin: 3045
priority: P2
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: large — pre-existing on main d1a4704; the cause is unknown after 210 loaded runs and needs a trace of which tiles were captured and under which key
---

# studio-map-posters.spec.ts:73: tiles past the live cap sometimes show sketches after the jump back

why now   — Under load (4 busy loops, 4 cores, retries 0) "no tile past the live cap showed a poster" fails about 1 run
            in 40: 1 of 100 on `main` d1a4704, 3 of 110 with #3092's capture change (the same rate within noise). The
            failure screenshot shows tiles 4 to 6 as sketches after the fast jump to the top, though the walk down waited
            at every stop until each live tile on screen had a poster.
where     — docs/e2e/studio-map-posters.spec.ts `postersPastTheCap`; docs/src/components/studio/StudioMap.tsx `onPicture`
            / `poster` (the key, the in-flight set); docs/src/components/studio/preview-pool.tsx capture queue.
how       — record, per tile, when its capture was offered, run, kept or dropped (`same()` false after the 8 tries, a
            null blob) and the key it was stored under; compare with the keys `poster()` asks for after the jump. If the
            posters exist and only the tier switch is late, the fix is a signal to wait on, not a longer timeout.
done when — 0 in 100 loaded runs of :87 and :90, retries 0, with the cause named.
evidence  — the per-tile trace of one failing run; an arm that fails on the cause.
verify    — self-review; the two specs x100 under load.
