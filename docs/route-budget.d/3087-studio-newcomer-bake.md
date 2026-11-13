studio: +739
home: +687
The Studio newcomer bake (PR #3102): single-slide-render.ts gains `adoptBake`, which writes a build-time first frame
before the engine loads, and the bounded wait that lets the first render patch it (+573), and DeckPreview its `bake`
prop (+114); StudioIsland +52 for newcomer-bake.ts. The home page pays the renderer's share because it shares the
module. Nothing was given back: `adoptBake` builds the frame with the renderer's own private `srcdoc()` and frame mount,
so it cannot move to a lazy chunk without exporting both. It buys the Studio's first slide about 1.3 s on a phone.
