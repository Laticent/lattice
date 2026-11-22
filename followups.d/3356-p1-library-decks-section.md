---
origin: 3356
priority: P1
recorded: 2026-11-22
area: website
severity: medium
swimlane: docs/src/components/studio/Library.tsx
deferred: blocked — the owner chose "Merge now, next PR": it builds on #3356's deck records, so it waits for #3356 to merge
source: https://github.com/Laticent/lattice/pull/3356#issuecomment-7069946899
---
# The Studio Library gets its own top-level Decks section

why now   — #3356 keeps whole decks in the Library, but they sit under Files with every other reference file. The owner
            decided (2026-11-22) that Decks becomes its own top-level Library section, beside All, Design, Media, Files
            and Plugins, in the PR after #3356. The Import button keeps today's behavior: it takes any file and rejects
            what Lattice does not support (owner: "allow the import of anything and reject what we don't support… least
            astonishing").
where     — docs/src/components/studio/Library.tsx (the section pills and their filter); the deck records #3356 adds
            (refdoc-decks/ in the backup, `readDeckReference`).
done when — a Decks pill lists every kept deck with Open as deck; Files no longer lists them; the empty state says how
            to import one; the Import button still takes any file.
evidence  — e2e: import a .lattice and a .md deck, both appear under Decks and open; screenshots at 1440, 820 and 390.
verify    — the Studio e2e for the Library on chromium, webkit-phone and gecko (HARD RULE #34 arms), and the
            tools/screenshot.js evidence at three widths (QUALITY BAR).
