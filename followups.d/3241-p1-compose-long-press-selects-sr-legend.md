---
origin: 3241
priority: P1
recorded: 2026-11-16
area: website
severity: medium
swimlane: engineering/decisions/2026-11-10-compose-first.md
deferred: off-path — the selection lands in the Studio chrome's screen-reader-only legend (chrome-parts.tsx), outside the compose tap probe this PR fixed; its cause is not traced yet, and the flaky-test coordinator ruled it is taken after the tap fix
source: https://github.com/Laticent/lattice/pull/3241
---

# A long press on Compose text ends with the selection on a hidden legend, not the word

why now   — PR 3241's iOS Simulator runs found it. In Compose, a long press on a paragraph first selects the word under the
            finger, as Safari should. On release the selection then jumps to the screen-reader-only legend of the
            Read/Write/Craft fieldset: "Workspace stop" on the iPad, "Lattice Studio" on the iPhone. A real user who long-presses
            a word to copy it, look it up or correct it gets a selection they cannot see, in text that is not theirs. It happens
            on every long press measured, so it is not the simulator flake the compose tap had.
where     — the legend: docs/src/components/studio/chrome-parts.tsx (`<legend className="sr-only">Workspace stop</legend>`).
            What moves the selection there after the release is not traced: start with Compose's selection and blur
            handling (ComposeView.tsx) and with Safari's selection callout on release.
done when — a long press on a Compose word leaves that word selected after release, in iPad and iPhone Mobile Safari, and a
            probe holds it.
evidence  — dispatch 43798678775 (job 133075639948), the logged hold sweep in docs/scripts/ios-safari/run.mjs: iPad, a hold
            the page saw as 632, 1035 and 1630 ms each gave `selectionchange "point"` at about 680 ms, then "Workspace stop"
            after touchend; iPhone, 1137 ms gave "point", then "Lattice Studio". The same "Workspace stop" selection is in the
            failures of dispatches 43760667692 and 43769541123 (job 132987632867).
verify    — tier 2 maker-checker; the iPad and iPhone ios-safari-studio suites, with a long-press arm logged as in PR 3241.
