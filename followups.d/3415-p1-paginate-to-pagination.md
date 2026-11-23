---
origin: 3415
priority: P1
recorded: 2026-11-22
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-21-plain-english-key-renames.md §D2
deferred: large — its own PR: about 580 repo decks migrate and the Marp bridge changes
source: https://github.com/Laticent/lattice/pull/3415
---

# Rename the deck key `paginate:` to `pagination:` (owner's choice B)

why now   — The owner chose B on 2026-11-22 (typed "2. B" in the command center at 02:09 UTC):
            one stem for the key and its switch classes `no-pagination` / `with-pagination`, which
            stay as they are. Rule 5 applies: the old key is a lint error and `lint:deck --fix`
            rewrites it.
where     — lib/core/meta-keys.mjs (`paginateOn`), lib/core/deck-settings.js (the `paginate` row;
            add a retired row), lib/core/marp-bundle-scope.js and lib/export/marp-bundle.js
            (Export to Marp: write `paginate:` back out, since it is Marp's own directive), the
            Marp import path (read `paginate:` and translate), lib/authoring/lint-core.js (new
            rule with a `replaceLine` autofix), the Studio's deck-config.js / DeckConfigPanel.tsx.
done when — `pagination:` drives page numbers; `paginate:` is an error with an autofix; every repo
            deck is migrated with --fix; a Marp deck with `paginate: true` imports and renders with
            page numbers; Export to Marp writes `paginate:`.
evidence  — the --fix diff count; a Marp round trip (Lattice deck → export:marp → marp-cli PDF
            with page numbers, and a Marp deck → Lattice); `npm run test:core test:tools`.
verify    — tier 1 checker (the Marp bridge is shared state for every imported deck).
