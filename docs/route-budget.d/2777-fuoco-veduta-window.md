studio: +189
playground: +1880
Both come from the preview-as-library line of work on this branch, not from the style-module work. The Fuoco hub (`docs/src/lib/fuoco/hub.ts`, shared by the Studio and the Playground) gained scrolled-stage handling: reports no longer cancel moves, a stale focus is judged, and a scrolled view is not pulled back (7d8e971). The Playground's filmstrip window now comes from Veduta's multi policy in `docs/src/playground/deck-render.js` (19a5a50). Nothing was given back in this PR.
