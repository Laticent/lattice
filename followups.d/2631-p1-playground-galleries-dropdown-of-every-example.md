---
origin: 2631
priority: P1
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-07-05-specimen-book-playground.md
source: https://github.com/Laticent/lattice/pull/2631
---

# Playground "Galleries": a dropdown that lists every `examples/*.md` deck

why now   — reviewing #2631 (avatars v2) showed there is no way to open `examples/avatars-dress.md` in the
            Playground. "Load a deck" lists only the curated showcase and per-family survey decks, so a
            per-feature demo deck (HARD RULE #9) can be reviewed only by pasting its source by hand. The
            reviewer had to be sent the file.
where     — `docs/src/playground/galleries.mjs` (`SHOWCASES`, `GALLERY_GROUPS`, `loadGalleries`) builds the
            list at build time from repo markdown; `docs/src/components/playground/GalleriesSheet.tsx` renders
            it; `docs/src/pages/playground.astro` hands both to the island. There are 267 `examples/*.md`
            decks today.
done when — the Galleries sheet has a dropdown (a select or combobox with search) listing every deck in
            `examples/`, labeled by its title with its slide count, and choosing one loads it into the editor
            the way the curated decks load, with the same dirty-draft backup and undo. A new example appears
            without editing a list. The page's payload does not grow by 267 decks: the list ships as names and
            counts, and a deck's source is fetched when it is chosen (the curated decks inline their sources
            today, which is why this cannot simply append them). Local images in a deck resolve as they do for
            the curated ones.
evidence  — the Playground built, with the dropdown open at desktop (~1440px), tablet (~820px) and mobile
            (~390px) from `tools/screenshot.js`, plus `examples/avatars-dress.md` chosen from it and rendered;
            the route-budget numbers before and after.
verify    — `tools/screenshot.js` at all three widths (QUALITY BAR), and the docs route-budget check
            (`docs/route-budget.d/` if the Playground route grows).
