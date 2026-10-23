---
origin: 2875
priority: P4
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §8
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose e2e: "copying a pill to another slide pastes the exact span" fails about 1 run in 4

why now   — measured on #2875 with `--repeat-each=8 -g "copying a pill"` on desktop: 2 of 8 failed with main's serializer, with this PR's previous commit and with its last one, so the PR does not cause it. An earlier brief guessed about 1 in 16. It fails at `toHaveCount` after the caret walk, so the arrow-key walk onto the pill most likely lands on text before the pill becomes an object.
where     — docs/e2e/compose-pill-editor.spec.ts:236 (the 9× ArrowRight walk, then `.ProseMirror-selectednode`).
done when — the spec places the selection on the pill through the DOM or the editor view instead of walking the caret, and 16 repeats pass.
evidence  — `--repeat-each=16` on desktop, all green.
verify    — tier 1 checker.

tried     — (2026-10-23, #2878's session) none of these removes it, measured with `--trace=off`, `--repeat-each=8..16`, desktop: (a) a retry of the whole caret walk inside `expect().toPass` (4 of 8 still failed; with the shipped `trace: 'on'` it passed 16 of 16, so the trace's slowdown hides the flake), (b) waiting for `.cs-slide-active` and clicking again before the walk, (c) a 40 ms delay per ArrowRight, (d) clicking the pill chip then Escape or Done (the selection is gone by the time the copy runs), (e) a DOM range around the pill (reads as text, no `.ProseMirror-selectednode`). When it fails, every attempt fails for the whole page load, so it is not a settling race. Next try: expose the EditorView to the spec (a test hook) and dispatch a `NodeSelection`, or find why the walk lands on text.
sibling   — `the keyboard steps over a pill as one thing` (compose-pill-editor.spec.ts:221) uses the same walk with no wait and failed 1 of 3 on the default config.

