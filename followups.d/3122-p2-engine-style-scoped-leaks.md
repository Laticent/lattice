---
origin: 3122
priority: P2
recorded: 2026-11-11
area: engine
severity: medium
swimlane: engineering/architecture.md
deferred: off-path — the owned engine's <style> handling; this PR fixed the vector PDF's list markers
source: https://github.com/Laticent/lattice/pull/3122
---

# The engine applies a `<style scoped>` block to every slide, not only its own

```text
  P2 · a scoped style leaks deck-wide in the owned engine
       why now   — found writing the list-marker fixture (test/fixtures/pdf-list-markers.md): a
                   `<style scoped>` on slide 3 restyled slide 1 too. Marp scopes it to its own
                   slide (Marpit's `scoped` attribute), so a deck written for Marp looks different
                   in Lattice. Repro: two slides, `<style scoped> p { color: red; } </style>` on
                   slide 2 only; `node lattice.js deck.md out.png` paints slide 1's paragraph red too
                   (241 red sample pixels on slide 1, 222 on slide 2).
       where     — the owned engine's style handling (lib/engine); Marp's own render path is retired (#1).
       done when — a scoped block styles only its own slide in every engine output, pinned by a test;
                   or the decision that the engine ignores `scoped` is written down and lint warns.
       verify    — tier 0 plus the repro above rendered before and after.
```
