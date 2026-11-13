studio: +581
playground: +132
home: +311

The Studio's photo checks and Compose now read what a slide inherits from the whole deck: a running `class:` and a carried
`backgroundImage` (docs/src/lib/slide-carried.ts over lib/core/slide-carried.mjs, the walk Export-to-Marp shares), which pulls
the front-matter key reader and the deck's slide ranges into the eager chunks that hold the photo finder. The engine break in
the same PR gives back the `![bg]` ruler, its keyword helpers and Compose's side helpers, which nets the Studio down to +581.
