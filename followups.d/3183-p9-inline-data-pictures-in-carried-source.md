---
origin: 3183
priority: P9
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/pipeline.md §4a1
deferred: blocked — cleaning a picture inside the deck source rewrites "the deck as written", a contract the owner decides
source: https://github.com/Laticent/lattice/pull/3183
---

# A photo written inline in the deck as data: text keeps its GPS wherever the deck source travels

why now   — PR 3183 cleans every photo the slides draw (PDF, player, Marp, .lattice photos), but a picture written into the
            Markdown itself (`![x](data:image/jpeg;base64,…)`) rides verbatim wherever the source is carried: the player's
            lattice-doc envelope, a .lattice deck.md, --embed-source, the Marp bundle's deck.md. A camera JPEG pasted inline
            keeps its location there. The privacy check on PR 3183 reproduced it (secrets survive in all four).
where     — lib/export/player-core.mjs (the source envelope), lib/core/reopenable.js and the CLI's .lattice writer, the
            Marp bundle writer; the Studio paths that carry source the same way.
done when — the owner has chosen: (a) clean inline data: pictures in the carried source (the source is then no longer
            byte for byte as written, and re-import shows the cleaned picture), (b) keep it verbatim and warn at export
            with the count of inline pictures carrying metadata, or (c) refuse to carry such a source without consent; then
            built with tests on every carrier.
evidence  — the privacy check's scan of each carrier for a GPS marker, before and after.
verify    — tier 1 checker.
