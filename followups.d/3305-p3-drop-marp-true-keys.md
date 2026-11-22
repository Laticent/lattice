---
origin: 3305
priority: P3
recorded: 2026-11-22
area: infra
severity: low
swimlane: engineering/decisions/2026-11-17-agent-pack.md §4.6
deferred: large — 550 deck files on main, a superseding decision note, and whatever reads the key; §4.6 itself says it ships as its own PR
source: https://github.com/Laticent/lattice/pull/3305
---

# Drop the `marp: true` keys from the repo's decks

why now   — The owner chose "revisit 2026-07-10" on #3305: drop `marp: true` from our decks and retire the tax of
            keeping them previewable in the VS Code Marp extension. It is recorded only in
            `engineering/decisions/2026-11-17-agent-pack.md` §4.6, as "a separate PR", with its own note
            superseding §5(b) of the 2026-07-10 audit (`engineering/decisions/2026-07-10-marp-audit-doc-framing.md`).
            550 tracked `.md` files on main (164ecfa) carry a `marp: true` line.
where     — every tracked deck with `^marp: true` (`git grep -l '^marp: true' -- '*.md'`); any test, lint rule,
            skeleton or doc that expects or teaches the key; export-to-Marp (`lib/export/marp-bundle.js`), which
            must keep writing the key into the bundles it exports.
done when — no repo deck carries `marp: true`, export-to-Marp still writes it into its bundles, a decision note
            supersedes §5(b) of the 2026-07-10 audit, and goldens re-bless with no page change.
evidence  — the owner's pick on #3305; the §4.6 paragraph; the count above.
verify    — `git grep -c '^marp: true' -- '*.md'` returns nothing outside export fixtures; `npm run build:check`,
            `npm test` and `npm run test:integration` green; an exported Marp bundle still opens in the extension.
