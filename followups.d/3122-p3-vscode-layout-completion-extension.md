---
origin: 3122
priority: P3
recorded: 2026-11-10
area: infra
severity: low
swimlane: engineering/decisions/2026-11-10-marp-vscode-theme-stubs.md
deferred: large — a new VS Code extension: its own package, tests and marketplace release
source: https://github.com/Laticent/lattice/pull/3122
---

# Layout completions that pop up only where a layout goes: a small VS Code extension

```text
  P3 · offer the layouts as you type, but only inside <!-- _class: … -->
       why now   — PR 3122 ships the 80 layout snippets on Ctrl+Space. The owner asked for pop-ups "for
                   certain things". Measured in the real VS Code 1.145.2 + Marp for VS Code 3.6.1, typing
                   deck prose with Markdown quick suggestions on: the menu opened on 21 of 30 words
                   (prefix lattice-kpi), 284 of 400 (/kpi) and 108 of 150 (::kpi); Ctrl+Space only: 0 of 150.
                   VS Code skips a prefix's leading symbols and matches loosely across the name, so no
                   snippet prefix keeps prose quiet. Only a completion provider can scope it.
       done when — an extension (or a contribution to an existing one) offers layout names, with each
                   manifest's one-line summary, inside `<!-- _class: ` and nowhere else; prose typing opens
                   no menu (re-run the same probe: 0 pops); the kit and bundle READMEs say how to get it.
       verify    — real VS Code: the prose probe (0 pops) plus a `_class:` completion that inserts the name.
```
