---
origin: 2874
priority: P3
recorded: 2026-10-24
area: engine
severity: low
swimlane: lib/authoring/lint-core.js
source: https://github.com/Laticent/lattice/pull/2874
---

# The linter splits slides at `---` only, so a heading that starts a new slide gives a record the wrong slide's class.

Found by the independent checker on #2874. The engine starts a new slide at a heading, but `splitTopLevel` in
`lib/authoring/lint-core.js` splits only at `---`. A deck with `## T`, a `video` record, a blank line, `## Sub` and a second
record makes the engine two slides (only the first is a `video` slide). The linter reads one slide, so it reports
`video-slide-class` against slide 1, and `video-bullet` says slide 1 "has no `@video` record" when it does.

The mismatch predates #2874 and every rule that reads a slide's class shares it, which is why #2874 leaves it alone.

```text
  P3 · [no ticket] lint-core's slide split ignores heading splits.
       where     — `splitTopLevel` and `slideClassDirectives` in lib/authoring/lint-core.js.
       done when — the video rules agree with the engine's section count on a deck with a mid-slide heading.
       evidence  — a probe deck: engine figure count and slide classes versus each rule's findings, as in
                   test/unit/plugins/video-address.test.js.
       verify    — checker; it touches the shared slide model, so run the whole lint suite.
```
