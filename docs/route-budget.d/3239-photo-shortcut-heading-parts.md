studio: +211
playground: +4
home: +4
The Studio's photo readers and Compose's placement badge now cut a `split: headings` slide into the engine's heading parts
(`headingPartStarts` and `slidePictureCount` in lib/core/placed-picture.mjs, `partPlacings` in docs/src/lib/slide-carried.ts,
`pictureSeat` in docs/src/lib/compose/image-objects.ts); `headingSplitPoints` was already in the Studio bundle, so only the
readers are new. The 4 bytes on the playground and home routes are the engine's `holdLongSrc`, which keeps a pasted photo's
address out of the picture shortcut's record (2.5 s to 1.6 s per render on three phone photos). Nothing was given back: both
are the smallest form of the fix, and the Studio is still 6.0KB under its ceiling.
