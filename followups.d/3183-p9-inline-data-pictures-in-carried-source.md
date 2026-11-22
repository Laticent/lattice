---
origin: 3183
priority: P9
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/pipeline.md §4a1
deferred: large — the owner chose to clean (2026-11-15); building it touches every carrier of the source (player envelope, .lattice deck.md, --embed-source, the Marp bundle) in two hosts, plus a new workspace setting and how the author is told
source: https://github.com/Laticent/lattice/pull/3183
---

# A photo written inline in the deck as data: text keeps its GPS wherever the deck source travels

why now   — PR 3183 cleans every photo the slides draw (PDF, player, Marp, .lattice photos), but a picture written into the
            Markdown itself (`![x](data:image/jpeg;base64,…)`) rides verbatim wherever the source is carried: the player's
            lattice-doc envelope, a .lattice deck.md, --embed-source, the Marp bundle's deck.md. A camera JPEG pasted inline
            keeps its location there. The privacy check on PR 3183 reproduced it (secrets survive in all four).
ruling    — 2026-11-15, owner: option A, clean the inline picture in the carried copy (the source is then no longer byte for
            byte as written; re-import shows the cleaned picture). Open, also the owner's: how the author is told or asked.
            The owner suggested a workspace setting. Options to put to the owner, with a recommendation, before building:
            (1) a workspace setting "Remove photo location from shared files", on by default, with the export's report
                naming how many inline pictures were cleaned;
            (2) no setting: always clean, and say so once in the export's report;
            (3) a setting, off by default, with a one-time prompt the first time an export finds an inline picture with
                metadata. The CLI needs the same choice as a flag and a front-matter word, read by one resolver.
where     — lib/export/player-core.mjs (the source envelope), lib/core/reopenable.js and the CLI's .lattice writer, the
            Marp bundle writer; the Studio paths that carry source the same way; the workspace settings store.
done when — the owner has chosen how the author is told; every carrier cleans inline data: pictures with lastra
            `cleanerFor` (the player's `createUriCleaner` rules: any case, parameters, wrapped or percent-encoded, CSS
            escapes, XML references), the setting and flag read through one resolver, with tests on every carrier.
evidence  — the privacy check's scan of each carrier for a GPS marker, before and after.
verify    — tier 1 checker.
