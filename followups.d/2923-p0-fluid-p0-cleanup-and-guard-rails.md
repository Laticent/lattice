---
origin: 2923
priority: P0
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §12
---

# Fluid P0 leftover: correct issue #506's body

why now   — it runs the CLI under its retired name, which no longer exists, and its design still reads "split as a preprocessor on the string", which P2 replaces with a post-render pass.
where     — GitHub issue #506 (backlog.d/506.md is generated from it; never edit the file).
done when — the owner has approved the edit, and #506's body names lattice.js and points at the Fluid note §8 P2/P4.
evidence  — the issue's edit history.
verify    — npm run build:check after the backlog sync regenerates backlog.d/506.md.
