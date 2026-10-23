studio: +473
playground: +40
The Studio's boot change adds `studio-boot.ts` (the engine, theme and runtime start, with its URL check) and `useFirstSlideShown` plus the editor hold in the shell: +473 B gz against main as CI measures it (StudioIsland +351, logo-finish +122), declared at +473. This is the cost of the phone first slide moving from 3.97 s to 3.29 s over HTTP/2 (see engineering/decisions/2026-10-23-studio-boot-order.md and -startup-bake-off.md; the HTTP/2 figures are in the latter's E4).
The Playground's page script reads +30 B from the `db-active` carry in `patchSections` that lets an edited diagram hold its previous drawing, declared at +40.
Given back first: `RuntimeWarm` left the Studio's HTML, and the editor's chunk graph no longer starts at hydration. A single chunk for every lucide icon was tried and dropped: it cost every route about 9 KB and pulled React into the icon chunk (E4).
