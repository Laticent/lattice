studio: +480
The Coach's photo-contrast finding adds a small static hook (`usePhotoContrast`), the `photo-contrast` rule name, and the pin button in `FindingCard` to the Studio island; the reader and the kernel (`photo-contrast-read.ts`, `lib/core/photo-contrast.mjs`) load lazily, only for a slide that names a photo.
Given back first: the photo sampler is shared with the thin-card ink feature (`meanUnderBox`, `boxInSection`) instead of copied, and the hook imports the reader dynamically. CI measured +464 B gz against main; +480 covers it with room for gzip spread.
