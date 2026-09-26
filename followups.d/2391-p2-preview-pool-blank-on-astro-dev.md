---
origin: 2391
priority: P2
recorded: 2026-09-26
---

# Pooled previews paint nothing under `astro dev`

why now   — the deck panel's preset picker and the Reshape picker both draw their tiles from
            `PreviewPool` (docs/src/components/studio/preview-pool.tsx). Under `npm run dev` the
            pool assigns no slots and the tiles stay empty; a production build (`astro build` +
            `astro preview`) paints them. Measured in #2391: 0 pool slots and 1 iframe on dev,
            4 slots and 5 iframes on the production build, for the same clicks. Anyone checking
            either picker on the dev server sees blank cards and may think the feature is broken.
where     — preview-pool.tsx. Suspect: React StrictMode's dev double-invoke runs the teardown
            effect (`alive.current = false`) and the re-run does not set it back, so `schedule()`
            refuses to arm for the rest of the pool's life. Unconfirmed.
done when — both pickers paint their tiles on `npm run dev`, with a test that fails if the pool
            stops scheduling after a StrictMode remount.
evidence  — dev vs production iframe and slot counts on /studio/ after opening each picker.
verify    — tier 1: a vitest under <StrictMode> around PreviewPool; then drive both pickers on
            the dev server.
