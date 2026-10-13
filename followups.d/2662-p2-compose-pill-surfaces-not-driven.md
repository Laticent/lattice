---
origin: 2662
priority: P2
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md §12
source: https://github.com/Laticent/lattice/pull/2662
---

# Three surfaces the pill editor was never driven on: Safari's `@scope`, IME next to a pill, and locked slides

```text
  P2 · [no ticket] Pill editor surfaces nobody drove: Safari `@scope`, IME composition, locked slides
       why now   — #2662 merged at confidence high, with these caveats open (HARD RULE #23: they are UNVERIFIED, not tested). (1) The pill is drawn through one `@scope`d stylesheet copied from the preview frame; a browser without `@scope` falls back to the source text in the code face, and nobody saw that fallback on a real Safari. The owner tried the preview on an iPhone and reported it worked, but did not say which iOS browser or which steps. (2) The gap pass inserts a space at the caret when code is typed beside a pill; IME composition at that spot was reasoned about, never run. (3) A locked slide (edited in Markdown) keeps its pills as plain text: drawing them there needs the structural guard's agreement, and the earlier build did draw them, disabled.
       where     — docs/src/lib/compose/pill-sheet.ts (`syncPillSheet` returns false without `@scope`), docs/src/lib/compose/inline-objects.ts (`normalizeObjects`: `slide.attrs.locked` skip, the gap pass), docs/src/components/studio/ComposeView.tsx (`structuralGuard`).
       done when — each has an artifact from its real surface: a screenshot of the Studio on real iOS Safari with the pill drawn (or the fallback, if `@scope` is absent), a typed IME composition beside a pill on a real device or the closest real browser, and a decision recorded in the decision note on whether locked slides should draw pills (and if yes, the change and its test).
       evidence  — screenshots or recordings from the named surfaces, not emulation.
       verify    — tier 0 for the fallback and the IME run; tier 1 checker if locked slides start to draw objects, because it touches the structural guard.
```
