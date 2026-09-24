---
origin: 2248
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2248#issuecomment-5753967687
---

# `--player` keeps the published-install break

Backfilled verbatim from the continuation brief on #2248 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P3 · [no ticket] `--player` keeps the published-install break
       why now   — lib/export/html-player.js still `require`s jsdom (lazily, in a function),
                   so `--player` fails the same way P1 does. Below P1 only because it
                   assembles a whole document and carries HARD RULE #22 stylesheet-sink
                   obligations that captions and reader-mode do not.
       where     — lib/export/html-player.js:115; read HARD RULE #22's DOC_STYLE_SINK_ROOTS
                   and engineering/gotchas.md before touching it.
       done when — `--player` produces a byte-identical .html with jsdom unresolvable.
       evidence  — the jsdom-hidden repro + a byte diff of the player output.
       verify    — tier 2 adversarial trio: it is a #22 sink, where the failure mode is a
                   beacon baked into every copy a recipient opens.
```
