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
where     — `docs/src/playground/galleries.mjs` (`SHOWCASES`, `GALLERY_GROUPS`, `loadGalleries`,
            `collectGalleryAssets`) builds the list at build time from repo markdown;
            `docs/src/components/playground/GalleriesSheet.tsx` renders it; `docs/src/pages/playground.astro`
            hands it to the island as the `galleryGroups` and `gallerySources` props; `PlaygroundApp.tsx`
            `onLoadGallery` is a synchronous lookup in `gallerySources` that opens the deck in EXPLORE mode (it
            sets `exploreSourceRef`; it does not write the editor or the draft, so there is no draft backup to
            reproduce). There are 267 `examples/*.md` decks today.
plan      — checked in the code, not built. The pattern already exists: `plansBase` fetches per-component walk
            plans on demand from static JSON emitted at build time (`PlaygroundApp.tsx` ~L1500,
            `playground.astro` L177). Do the same here: emit one static file per deck (and one small index of
            id, title and slide count) under the Playground's static folder from
            `docs/scripts/sync-playground-assets.mjs`; make `onLoadGallery` async (fetch the deck, keep the
            existing "Gallery unavailable." status line for a failed fetch); fetch the index when the Galleries
            sheet first opens, so the route's eager payload does not grow. Local images need no change: decks
            reference them as `sample:` refs and `collectGalleryAssets` already stages them.
done when — the Galleries sheet has a searchable dropdown (a select or combobox) listing every deck in
            `examples/` by title with its slide count, and choosing one opens it in Explore the way the curated
            decks open. A new example appears without editing a list. The page does not inline 267 decks:
            decks and the index are fetched on demand. Pictures in a deck render as they do for the curated ones.
evidence  — the Playground built, with the dropdown open at desktop (~1440px), tablet (~820px) and mobile
            (~390px) from `tools/screenshot.js`, plus `examples/avatars-dress.md` chosen from it and rendered;
            the route-budget numbers before and after.
verify    — `tools/screenshot.js` at all three widths (QUALITY BAR), and the docs route-budget check
            (`docs/route-budget.d/` if the Playground route grows).
