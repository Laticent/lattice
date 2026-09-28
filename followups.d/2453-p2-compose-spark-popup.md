---
origin: 2453
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2453
---

# A spark editing popup in the Studio's Compose view

why now   — PR #2453 ships inline sparks (`~{12 14 17}:bar:lg`) with autocomplete and a
            size-fit warning in the Markdown editor. The owner asked for a custom popup in
            Compose too and marked it a possible follow-up: in Compose a spark is a rendered
            chart, so an author who wants to change its type, size, color or frame has no
            handle on it short of switching to Markdown.
where     — the Studio's Compose view (docs/src/components/studio/, the Markdown/Compose
            toggle) and the spark kernel lib/core/inline-sparks.js, whose `resolve()` fields
            (type, size, c, fill, zero, frame, look, corners, markers) are the popup's
            model; spec engineering/decisions/2026-09-28-inline-sparks.md.
done when — clicking a spark in Compose opens a popup that edits its data and every
            modifier axis, writes the canonical `` `~{…}:mods` `` span back to the source, and
            offers the same "size it down to fit" fix as the Markdown editor's warning.
evidence  — owner's request in the PR #2453 session, 2026-09-28.
verify    — drive the real Studio (built docs site) at 1440 / 820 / 390px: click a spark in
            Compose, change its type and size, and see the source and the preview update.
