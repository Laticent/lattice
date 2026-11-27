---
origin: 3593
priority: P3
recorded: 2026-11-27
area: engine
severity: low
deferred: off-path — other verbs' completion and a docs-site table; this PR only reserves `lattice mcp`
swimlane: lib/cli/complete.js
source: https://github.com/Laticent/lattice/pull/3593
---

# Three small gaps in the CLI's completion and its reference page

```text
  P3 · [no ticket] fix three older gaps the #3593 checker found
       why now   — #3593 reserved `lattice mcp` and its checker read the completion code. These
                   predate it and are off its path:
                     - `lattice lint <Tab>` and `lattice fmt <Tab>` fall through to the render
                       completions (`complete()` in lib/cli/complete.js has no branch for them),
                       so they offer output paths and render flags like --palette.
                     - `migrate` is a dispatched verb (lattice.js) but not in SUBCOMMANDS, so
                       `lattice mi<Tab>` offers nothing.
                     - On /reference/cli/ at 390px, the `lattice completion` install table runs
                       off the right edge (screenshot on #3593).
       done when — lint and fmt complete deck paths and their own flags, migrate completes
                   with its two forms, and the table wraps or scrolls inside its box at 390px.
```
