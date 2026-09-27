---
origin: 2417
priority: P2
recorded: 2026-09-27
---

# Phase C: `lattice packages new plugin`, the draft `spec/LPM.md` and the author docs

why now   — phase C of `engineering/decisions/2026-09-27-plugin-system.md` §7. Nobody outside
            this repo can write a plugin until a scaffold exists and the contract is written
            down as a spec rather than as a decision note.
where     — `lib/packages/cli.js` (the `lattice packages` command; it has no `new` subcommand
            yet), `lib/packages/kinds.js` (the `plugin` kind row), `lib/plugins/README.md`
            (today's author guide), and a new `spec/LPM.md`.
done when — `lattice packages new plugin <name>` writes a folder that passes `npm run
            build:check` and `npm run test:plugins` with no edits; `spec/LPM.md` states the
            manifest, the syntax and render module shapes, and `api: 1`.
evidence  — a transcript of the scaffold being generated, built and tested on a clean tree,
            pasted into the PR body.
verify    — tier 1 checker, because it defines the public author contract, which is hard to
            change after release.
