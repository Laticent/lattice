# Evidence: the strip's slide actions by touch, at phone and tablet width

Ran on 2026-10-28 against this branch: headless Chromium with touch, at 390×844 (phone) and 820×1180 (tablet), on the
docs dev server (`cd docs && npx astro dev --port 4321`). Run it with
`BASE=http://localhost:4321/studio/ node engineering/decisions/2026-10-27-slide-structure-strip/touch-ops/touch-ops.mjs`.

`touch-ops.mjs` loads a heading-split deck (Alpha, Bravo, Charlie as one block), taps Bravo in the strip, then taps
Move later, Duplicate, Delete and the notice's Undo, logging the deck order and the focused slide after each:

| Step | Phone and tablet (identical) |
|---|---|
| Start | Alpha Bravo Charlie, slide 1 / 3 |
| Move later on Bravo | Alpha Charlie Bravo, at 3 / 3 |
| Duplicate | Alpha Charlie Bravo Bravo, at 4 / 4 |
| Delete (one tap) | Alpha Charlie Bravo, at **3 / 3** |
| Undo (the notice) | Alpha Charlie Bravo Bravo, at 4 / 4 |

All four actions and the notice's Undo are on screen and reachable by touch at both widths. The first run found the
Delete step landing on 2 / 3 instead of the new last slide: a length clamped one short in `deleteSlide`, older than this
PR; fixed, and pinned in `deck-ops.test.ts`.
