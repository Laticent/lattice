studio: +600
playground: +250
home: +250
Two small pieces move the Studio's warm-ups, lint and math fonts off the first slide. The first-slide gate (`first-slide.ts`: a promise, a 6 s backstop and the wait for a pause in input) and its four call sites in StudioShell and the Editor; and `sourceHasMathOutsideCode` in lib/plugins/math/math.syntax.mjs, which every route's shared chunk carries beside `sourceHasMath` (about 200 B gz). Measured in CI against main 46621ac: studio +507, playground +200, home +204; the declared figures leave room for gzip spread.
What it buys, measured on a throttled phone profile: the main thread is busy 1.3-1.6 s instead of 2.2-2.5 s in the 3 s after the first slide, and a deck that mentions math only inside code no longer fetches 21 KaTeX font files.
