# engineering/ — the engineer's knowledge base

How to work on Lattice. The entry point for agents and humans alike is the
repo-root `CLAUDE.md` (the index of rules + pointers); the deep references
live here:

| Doc | What it covers |
|---|---|
| `architecture.md` | Engine internals; where transform kernels live |
| `development.md` | npm scripts, tests, hooks, CI, the cloud sandbox |
| `workflow.md` | Branching, feature decks, rebase/merge, standups |
| `gotchas.md` | Symptom-indexed debugging ("X looks wrong" → cause) |
| `capabilities.md` | GENERATED index of every script/tool — don't edit |
| `quality-assessment.md` | The 7-dimension codebase health tooling |
| `cascade.md`, `typography.md`, `treatments.md`, `pipeline.md`, `mermaid.md`, `visual-review.md`, `marp-independence.md` | Deep dives |
| `decisions/` | Dated investigation/decision notes; its README's index is GENERATED (`npm run decisions:index`) |

**Gotcha:** `capabilities.md` and `decisions/README.md` are generated —
edit their generators (`tools/build-capabilities.js` /
`tools/build-decisions-index.js`), never the files.
