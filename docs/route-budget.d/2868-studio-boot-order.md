studio: +300
playground: +8000
home: +9700
components: +9200
getting-started: +9400
The Studio's boot change adds `studio-boot.ts` and `useFirstSlideShown` (+385 B gz on its own), and putting every lucide icon in one chunk (`astro.config.mjs`, `vite.build.rollupOptions.output.manualChunks`) removes about 24 requests from the Studio's startup path: the Studio ends within a few hundred bytes of main (`main` moves between runs, so each figure is declared with about 300 B of headroom). The chunk is 15.8 KB gz and loads on every route that uses any icon, so four other routes pay +7.6 to +9.3 KB of eager JS. What that bought and cost, measured (engineering/decisions/2026-10-23-startup-bake-off.md E4): Studio phone first slide 4.42 s to 4.09 s, interleaved, disjoint IQRs; Playground first slide 2.40 s to 2.35 s over three rounds (the saved requests outweigh the extra bytes). All five routes stay under their ceilings. A route-aware split is not possible from the build config, because an icon's importer is the shared barrel.
The Playground's page script also reads +30 B from the `db-active` carry in `patchSections` that lets an edited diagram hold its previous drawing.
Given back first: `RuntimeWarm` left the Studio's HTML, and the editor's chunk graph no longer starts at hydration.
