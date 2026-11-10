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
- **The `image` plugin**: `@image{photo.jpg, title="…", description="…"}` on a line of its own, with Markdown's
  `![title](src "description")` as its alias. The slide places it: an `image` slide makes it the photo panel (`mirror` puts it
  on the left), the new `bleed` class makes it a slide's background, and any other slide shows it as a figure with the shared
  layer's frames, finishes, tones and sizes (`image:` register). The address comes only from the author's own record.
- Marp's `![bg …](…)` keywords are retired: `lint:deck` warns (`image-marp-keyword`) and `--fix` writes the `@image{…}` record,
  moving the placement to the slide (`left` becomes `mirror`; a background on any other slide becomes `bleed`).
- The vector PDF keeps a picture's tone and finish (and a `bleed` slide's scrim): the writer used to draw the photo as a vector
  over its own blend layers, which take no hit test.
- A picture's box is known before it loads, in a CLI export: the CLI reads the file's size, so a slide lays out the same with
  the picture missing, and an `lg` picture under a heading no longer overflows.
