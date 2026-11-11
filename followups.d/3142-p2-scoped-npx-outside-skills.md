---
origin: 3142
priority: P2
recorded: 2026-11-11
area: docs
severity: high
swimlane: engineering/decisions/2026-11-11-skillspector-nightly.md §5
deferred: blocked — `@laticent/lattice` is not on npm until the owner publishes it (by 2026-11-15); rewriting the docs before then points readers at a command that 404s
source: https://github.com/Laticent/lattice/pull/3142
---
# Say `npx @laticent/lattice` everywhere a reader copies a command, not only in the skills

why now   — On npm, unscoped `lattice` belongs to an unrelated publisher (openlattice). Outside a
            Lattice project, `npx lattice` downloads and runs their code. PR #3142 fixed the 69 lines
            in the shipped skills (`design/skills/`); about 149 more still say the bare name: README,
            AGENTS.md, RELEASE.md, the docs site (`getting-started.md`, `guides/cli.md`,
            `reference/cli.md`, the theme and finish pages), `tools/build-cli.js` help text,
            `examples/`, `engineering/` docs. `git grep -n 'npx lattice' -- . ':!dist'` lists them.
how       — After the publish: rewrite reader-facing commands to `npx @laticent/lattice` (keep
            `node lattice.js` where the text is clone-only). Leave dated history (decision notes,
            changelog) as written. Consider a lint or `build:check` arm that rejects a bare
            `npx lattice` in live docs, so it cannot creep back.
done when — `git grep 'npx lattice' -- . ':!dist'` returns only history and sanctioned files.
verify    — `npx @laticent/lattice --help` works in an empty folder; the docs site builds.
