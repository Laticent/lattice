studio: +173
home: +41

The Studio's photo verdict (coach/photo-contrast-watch.ts) now reads a slide again when the preview paints, while the slide is unmeasured: on a phone, typing in Source and opening Preview ran the one read before the frame showed the slide, and the Coach's photo finding never appeared (photo-contrast-coach.spec.ts:91, 13 of 100 under load). StudioIsland carries the watch's retry and the shell's paint-listener set (+132). DeckPreview, which the home page also ships, carries the new `onPaint` signal, which waits for a full write's `load` so a read on it sees the new slide (+41).
