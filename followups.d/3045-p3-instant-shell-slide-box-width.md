---
origin: 3045
priority: P3
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: off-path — pre-existing on main 5346e25 with the spec unchanged; the shell's slide-box geometry, not the engine hold this PR rewrote
---

# studio-instant-shell: two matrix cases fail on the slide box width in the cloud sandbox

why now   — While exercising zero-flakes part 3 (which rewrote this spec's engine hold), two matrix cases failed every
            run, on `main`'s copy of the spec as well as the branch's (2 of 2 runs each, desktop project, 4 cores):
            "1440x900 @ write (editor collapsed to its 46px rail)": slide box width shell 1207 vs app 1211;
            "390x844 @ write (rotated while the engine was still loading)": shell 301 vs app 304. The tolerance is 2 px.
            Neither is @smoke, so per-PR CI does not run them; whether the nightly sees them is not known.
where     — docs/e2e/studio-instant-shell.spec.ts:251 (the matrix), `near(...)` at :148; the shell's compute path for
            the slide box (the instant shell's seed, `#ssr-slidebox`).
how       — first check the Studio e2e nightly for these two cases. If CI is green, the difference is the sandbox
            (fonts or scrollbar width): measure both sides' pane width and padding there. If CI is red too, the shell's
            letterbox math misses 3 to 4 px in a collapsed-editor and a rotated layout; compare the shell's pane width
            with the app's `[data-pane-role="preview"]`.
done when — both cases pass in the sandbox and in the nightly, or the cause is named and the tolerance justified.
evidence  — the two widths on each side, and the run that passes.
verify    — the matrix x10 on desktop.
