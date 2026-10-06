---
origin: 2424
priority: P2
recorded: 2026-10-04
---

# Check the desktop app against the state chart v2 attributes

```text
  P2 · [no ticket] Run the Tauri desktop app on the state chart v2 engine and confirm it draws.
       why now   — #2424 renamed what a state chart figure carries: `data-sc-model` /
                   `data-sc-drawn` replace `data-sc-transitions` / `data-sc-svg`,
                   `installStateChartLayout` moved to `state-chart.layout.js`, and the
                   `.state-dot` key became the shared `.fc-key`. The writer
                   (`state-chart.transform.js`) and the engine's only reader (`lib/runtime`,
                   the package's `./runtime` export) both ship in the npm package, so a host
                   that embeds the package's runtime gets both sides. It breaks only if the
                   desktop app has code of its own reading the old names. That repository was
                   not reachable from the #2424 session, and the owner merged at high
                   confidence with this as the follow-up.
       where     — the desktop app's repository (the README's "Laticent — the desktop app
                   (Tauri)"), not this one.
       done when — `git grep -nE 'data-sc-transitions|data-sc-svg|installStateChartLayout|
                   state-dot|state-legend'` in the desktop app finds nothing (or each hit is
                   moved to the v2 names), and the app opens `examples/state-chart.md` and
                   draws its default and `inline` slides as the CLI export does.
       evidence  — the grep output, and a screenshot of the state chart slide in the app.
       blocked   — 2026-10-05: still unreachable. The session's GitHub account lists only
                   Laticent/lattice, and attaching the desktop repo was refused. The
                   owner, or a session started with that repository selected, can run it.
                   2026-10-06: still unreachable. list_repos for this account shows only
                   Laticent/lattice among Laticent's repositories, and add_repo for
                   Laticent/laticent (the README's name for the app) was refused: no access.
                   The README links no repository URL, so the repo's real name is also
                   unknown here. Needs the owner: grant this account access, or name the repo.
       verify    — tier 1.
```
