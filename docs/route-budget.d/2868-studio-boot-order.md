studio: +400
playground: +40
The Studio's island gains `studio-boot.ts` (the engine, theme and runtime start, with its URL check) and `useFirstSlideShown` in the shell: +385 B gz measured by CI against main (StudioIsland +263, logo-finish +122, a shared chunk re-split), declared at +400 for gzip spread. This is the cost of the phone first slide moving from 5.00 s to 4.50 s (engineering/decisions/2026-10-23-studio-boot-order.md).
The Playground's page script reads +30 B from the `db-active` carry in `patchSections` that lets an edited diagram hold its previous drawing, declared at +40.
Given back first: `RuntimeWarm` left the Studio's HTML, and the editor's chunk graph no longer starts at hydration.
