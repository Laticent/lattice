studio: +14
The Studio's pre-paint seed (studio.astro, inline in the page, bundled into the eager island by the build) now reads the remembered `lattice-studio-map` flag and picks the taller footer height when it is on, so the shell frames the app with the slide map open. CI measured +14 B gz on `StudioIsland`; the two new constants live in `preview-rect.ts`.
Given back first: the comment on the new lines is a single sentence, and the derivation is in `preview-rect.ts` rather than in the shipped HTML.
