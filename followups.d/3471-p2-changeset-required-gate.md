---
origin: 3471
priority: P2
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §5
deferred: blocked — a diff-aware gate adds a CI step, which is the owner's call (CLAUDE.md SECOND FILTER row 2)
source: https://github.com/Laticent/lattice/pull/3471
---
# Decide whether a PR that touches published source must carry a changeset

why now   — §5 slice C planned a gate that requires a changeset (or fragment) on a PR touching published
            source, Dependabot exempt. Without it, a user-visible change can ship with no entry and no bump.
where     — a CI step or a lefthook check reading the PR diff; the publish set is tools/release-packages.js.
done when — the owner has picked (gate, warn-only, or none) with its measured cost, and the pick is built.
evidence  — the gate failing on a PR with a lib/ change and no changeset, and passing with one.
verify    — tier 1 checker, because it changes what every PR pays.
