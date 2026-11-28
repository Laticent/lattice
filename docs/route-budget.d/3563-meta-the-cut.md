studio: +600
home: +650
playground: +200
The cut (slice E of the @meta clean break) makes the Studio and the docs-site pages tell an old setting comment from a record, and the door that every page's editor shares now blanks the old forms where the engine could apply them. CI measured studio +459, home +505 and playground +100 against main on 798667c5: `isLegacySetting` and its pane-marker test land in `comment-directive` (+341), the door's code-aware comment walk (`blockLead`, `ownLineTail`, the lazy close search that keeps a long inline code span linear) in `meta-door` (+200), and the playground's +100 is `PlaygroundIsland` and `video-overlay` moving a few bytes. No new module and no preload link.

Given back first: a static import in `docs/src/lib/style-loader.ts` had put the whole door on the playground's eager path for a prefetch hint (+20,348 bytes); it now loads with `import()`. The door's two branches share their record-or-blank code, and the engine drops the empty internal comment in one place, which took the getting-started engine back under its ceiling (354,332 to 354,258 bytes, measured with check-route-budget's own `measure`). Each line rounded up for build noise.
