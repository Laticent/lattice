- **`>{…}` is the video record's short form** (`` `>{"https://youtu.be/x", title="Tour"}` ``), as `^{…}` is an icon's and
  `!{…}` an avatar's; `@video{…}` still works. Segno's tag set (`TAGS`) gains `>`, so a top-level value can no longer start
  with `>`: no shipped deck wrote one (all 458 render byte-identically).
- **A video record draws its poster on any slide**, not only on a `video` slide: until now `@video{…}` elsewhere drew a bare
  text link, and `lint:deck` warned (`video-slide-class`, removed). The `video` slide still seats the clip beside its words.
- **Frames, finishes, tones and sizes for clips**: `@video{…}` takes `sm`/`md`/`lg`, a frame (`mat`, `keyline`, `float`,
  `device`, `corners`), a finish on the poster (`nimbus`, `halo`, `meridian`, with a strength such as `nimbus=40`), a tone
  (`duotone`, `grayscale`) and `show=title|all|none`; a deck sets them once with the `video:` register. The same shared layer
  (`lib/base/base.media.css`) serves pictures, so a clip and the photo beside it match.
- Narration speaks a media figure's title, then its description, from the record, whatever the slide shows; author HTML can
  no longer forge a figure's `data-lattice-title`, `data-lattice-description` or `data-lattice-media` (renamed `data-author-…`).
