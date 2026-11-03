---
origin: 2998
priority: P2
recorded: 2026-11-01
area: website
severity: medium
swimlane: engineering/decisions/2026-07-20-nacre-preview-loader.md
deferred: off-path — PR 2998 changes how these two surfaces decode photos (through `lib/core/image-painting.js`), but not what size they load; giving them preview-sized copies is new work on two render paths separate from the Studio's (`deck-render.js`, the Stage window)
source: https://github.com/Laticent/lattice/pull/2998
---

# The Playground filmstrip and the Stage window still load full-size photos

why now   — PR 2998 gives the Studio's preview frames preview-sized photo copies. The
            Playground filmstrip (`deck-render.js`) and the Stage window still load the
            originals, so each distinct photo they show costs a full-size decode (~48 MB for
            12MP) that WebKit keeps after the slide is gone. That PR's change from `decode()` to
            `load` stops them forcing decodes of slides off screen, but not of slides on screen.
where     — `grep -rn "deck-render" docs/src/playground`; the Stage window's render path.
done when — both surfaces render background photos through `preview-image-scale.ts` copies
            sized to their drawn width × DPR.
evidence  — the WebKit photo bench run against the filmstrip, before and after.
verify    — WebKit bench, plus a real iPhone if one is reachable.
