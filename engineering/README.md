# engineering/ — the engineer's knowledge base

How to work on Lattice. The entry point for agents and humans alike is the
repo-root `CLAUDE.md` (the index of rules + pointers); the deep references
live here:

| Doc | What it covers |
|---|---|
| `architecture.md` | Engine internals; where transform kernels live |
| `development.md` | npm scripts, tests, hooks, CI, the cloud sandbox |
| `workflow.md` | Branching, feature decks, rebase/merge, standups + handoff briefs |
| `house-style.md` | How we write ABOUT the work — chat, issues, PR bodies, changelog, docs, comments (HARD RULE #30) |
| `gotchas.md` | How the gotchas work; the symptom index itself is generated into `dist/engineering/gotchas.md` |
| `quality-assessment.md` | The 7-dimension codebase health tooling |
| `science.md` | Map of the algorithms and models we ship (color science, Segno, Trama's router, formats, statistics), and what we deliberately don't do |
| `jank.md` | Does a layout STAY PUT as its content grows — drift, silent collision, crowding (`check:jank`) |
| `cascade.md`, `typography.md`, `treatments.md`, `pipeline.md`, `mermaid.md`, `visual-review.md`, `marp-independence.md` | Deep dives |
| `decisions/` | Dated investigation/decision notes; their index is generated into `dist/engineering/decisions.md` |

**Generated indexes live in `dist/engineering/`, never here.** `capabilities.md` (every
script/tool), `decisions.md` and `gotchas.md` are built from one-file-per-item sources by
`npm install`, the SessionStart hook and `npm run build`, and are not committed — so two PRs
that each add a tool, a note or a gotcha never touch the same file. Edit the source (a
tool's header, a note's front-matter, a gotcha topic file), never the index.
`engineering/decisions/2026-10-09-generated-indexes-uncommitted.md`.
