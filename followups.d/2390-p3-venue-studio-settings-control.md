---
origin: 2390
priority: P3
recorded: 2026-09-26
---

# Give `venue:` a control in the Studio's deck settings

why now   — #2390 shipped `venue: laptop | huddle | conference | hall`, and the Studio offers it
            only as front-matter autocomplete and a row in the front-matter reference. An author
            who works in Settings → Deck never sees it, and it is the setting that decides whether
            a projected deck is legible from the back row.
where     — docs/src/playground/deck-config.js (Look section, beside Card lift; EMIT_ORDER; the
            parse/emit helpers), docs/src/lib/front-matter-docs.ts (`studio:` path for `venue`),
            docs/src/components/studio/editor-complete.ts; the settings-panel coverage note
            engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md.
done when — Settings → Deck → Look shows a Venue select (Laptop / Huddle room / Conference room /
            Hall) with one line of help each, writes `venue:` (omits it for laptop), reads an
            existing value back, and the front-matter reference names the Studio path.
evidence  — tools/screenshot.js of the settings panel @1440/820/390, and a Studio run showing a
            deck switching to `conference` renders at one size.
verify    — tier 0 gates plus the Studio e2e for the settings panel, because it is one select
            wired through an existing, tested seam.
