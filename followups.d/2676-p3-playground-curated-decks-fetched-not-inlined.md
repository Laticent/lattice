---
origin: 2676
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-07-05-specimen-book-playground.md
source: https://github.com/Laticent/lattice/pull/2676
---

# Playground: fetch the curated Galleries decks on demand too, and drop them from the route's props

why now   — #2676 made the 273 example decks fetch-on-demand, but the 16 curated decks (4 showcases + 12
            families) still ride inline in the route's `gallerySources` prop, so every Playground visitor
            downloads them whether or not they open the Galleries sheet. Two paths to a deck is also one more
            than the sheet needs.
where     — `docs/src/pages/playground.astro` (`gallerySources`), `PlaygroundApp.tsx` (`onLoadGallery` is a
            synchronous lookup; `onLoadExample` is the async twin), `docs/scripts/sync-playground-assets.mjs`
            (would stage the curated decks beside `galleries/`), `docs/src/playground/galleries.mjs`
            (`SHOWCASES`, `FAMILIES`, `loadGalleries`).
plan      — not built. Stage each curated deck as a static file, keep only id/label/slides in the props, and
            let `onLoadGallery` reuse the same fetch-then-`openGalleryDeck` path as examples. Measure first:
            the playground htmlRaw is 555.5 KB against a 539 KB soft target, and most of that is these props.
done when — the Playground route no longer carries curated deck source (htmlRaw drops by the measured size,
            route-budget soft target ratcheted down), and a curated deck opens exactly as before.
evidence  — route-budget before/after from `npm run build` in `docs/`; a curated deck chosen from the sheet in
            the built site at 1440/820/390 via `tools/screenshot.js`.
verify    — the docs route-budget check, and the Galleries sheet driven in a real browser.
