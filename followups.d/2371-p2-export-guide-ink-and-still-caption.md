---
origin: 2371
priority: P2
recorded: 2026-09-27
---

# The exported Guide draws no ink and no cursor, and somber's caption still crawls there

why now   — the exported player now focuses as the Studio does (this PR), but two preset
            differences stop at the Studio: expressive's top moment draws ink and shows the
            cursor, and the ink fallback on an image or a figure; and somber's caption reads
            the line in one muted ink rather than crawling word by word. A sent expressive
            deck therefore reads like a restrained one on its top moment, and a sent somber
            deck's caption moves when the Studio's does not.
where     — ink: docs/src/components/studio/present-guide.ts (`guideCueIn`, the Vetrina stage) and
            docs/src/components/studio/guide-player.ts; it needs Vetrina in the bundle (47 KB
            minified), so measure first and decide whether the export earns it. Caption:
            lib/export/player-core.mjs `paintCrawl` and `playerCss` (gate the rule on a guided
            export, so every other export stays byte-identical), with `caption` added to
            `guideLook`.
done when — an exported somber deck's caption shows each line in one quiet ink with no crawl;
            and the owner has decided whether expressive's ink ships in the export, and if so
            it draws on the top moment as in the Studio.
evidence  — dark and light renders of an exported somber and expressive deck for export sign-off,
            and the bundle size before and after.
verify    — maker-checker; export sign-off (it changes exported bytes).
