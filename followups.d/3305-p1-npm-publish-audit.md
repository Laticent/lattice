---
origin: 3305
priority: P1
recorded: 2026-11-17
area: infra
severity: high
swimlane: engineering/decisions/2026-11-17-agent-pack.md §4.2
deferred: blocked — `@laticent/lattice` is not on npm yet; the owner plans the release for Sunday 2026-11-22
---

# After the npm release, audit every place that assumes or denies the package is published

why now   — #3305 writes the agent pack as if `@laticent/lattice` were already published, on the
            owner's instruction ("act like it is released, anticipating the future"). Until it is,
            every `npx @laticent/lattice …` line in the pack, `start.md` and the skills fails on a
            reader's first try with E404. The owner plans the release for Sunday 2026-11-22. That
            day the pretense becomes true, and every place written for either side needs checking.
where     — Places that ASSUME it is published (must now actually work):
              - the agent pack: `tools/build-agent-kit.mjs` (`renderDoc`, `startDoc` §Check and
                render, `rootReadme`), served at lattice.style/agents/ and on `dist-kits`;
              - `/llms.txt` (`docs/src/lib/discovery.mjs`, "Render and check");
              - `README.md:103` and `:111`, `RELEASE.md:85`, `AGENTS.md:140`, `design/skill.md:67`;
              - `design/skills/*.md` (cli, chart-from-data and the rest: about 40 `npx` lines);
              - `docs/src/content/docs/guides/cli.md` and `reference/cli.md`;
              - `.github/skillspector-baseline.yaml:16-23` (the RP1 "no @version" exemption).
            Places that DENY it, or work around its absence (must change):
              - `lib/export/marp-bundle.js:654-660`: the bundle's package.json leaves Lattice
                out because "it is not published to the public registry";
              - `backlog.d/2082.md` (issue #2082): the Marp kit rework, blocked on this publish;
              - `docs/src/content/docs/getting-started.md:15`, `guides/cli.md:32` and
                `README.md:80`, which lead with `git clone` as the only way in;
              - `tools/build-agent-kit.mjs` comments that explain a route by the package's absence.
            Find more with `git grep -n -E "npx @laticent/lattice|npm (i|install)( -g)? @laticent/lattice|not published|E404"`.
done when — `npx @laticent/lattice deck.md deck.pdf` renders a deck from an empty folder on a
            clean machine; every place above is either verified working or rewritten; the
            agent pack's render page and `start.md` are re-read against the published CLI's
            `--help`; issue #2082 is unblocked or closed; and `npm run build` regenerates the
            pack with no "not published" wording left.
evidence  — `npm view @laticent/lattice version` returns the released version; a transcript of
            the clean-machine render; the `git grep` above, run after the edits, with each
            remaining hit explained.
verify    — run `tools/agent-pack-eval.mjs` once with OPENROUTER_ALLOW_SPEND=1 after the edits, and
            render its decks with the published package rather than `dist/lattice.js`.
