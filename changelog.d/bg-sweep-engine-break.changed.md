- **`lint:deck --fix` rewrites a Marp `![bg …](src "description")` line into Markdown's picture, `![description](src)`**,
  rather than an `@image{…}` record, and moves its placement to the slide as before (`left` becomes `mirror` on an `image`
  slide; any other slide gains `bleed`). On those slides Markdown's picture is the record's shortcut, so it draws the same
  photo, and the line stays the one an author already knows. A description that starts with `bg` becomes `Image: …`, so it
  never reads as the keyword again. A line with no description becomes `![](src)`, which `image-no-alt` then asks you to name.
- Every shipped example deck is swept off `![bg]`, and each swept photo gets a name a screen reader can say. 15 of the 16 swept decks render
  pixel-identically to `main`; `bg-on-any-slide`'s three background slides gain `bleed`'s scrim behind the heading.
  `examples/bg-split-ratio.md`, which showed a `![bg left:40%]` share being ignored, is removed.
- Exporting a deck with a locked figure (a drawing the CLI captures in its own page) to PNG or PDF no longer fails with
  `Cannot find module '../core/sanitize-slide-html.mjs'`: the bundled CLI read two files relative to `dist/`.
- The Studio's photo checks and Compose now see what a slide inherits from the slides before it. A running
  `<!-- class: image -->` set on an earlier slide, and a `backgroundImage` from the front matter or an earlier slide, change
  which picture is a slide's photo; the Studio read one slide's text, so its photo-contrast check stayed silent on such a
  slide, and Compose's Placement badge called a picture placed that the engine drew in the text. Both read the whole deck now,
  through the walk Export-to-Marp uses (lib/core/slide-carried.mjs).
- `lint:deck` (and the Studio's lint panel) now warns on every Marp `![bg …]` line (`image-marp-keyword`), and its fix
  rewrites the line as above. The `image` layout's samples, skeleton and slot description, the galleries and the component's
  docs now teach `![A name](path)` on an `image` slide.
- **Breaking:** the engine no longer reads Marp's `![bg …]` keywords. A `![bg](photo.jpg)` line draws as an ordinary
  picture in the slide's text, on every surface (CLI, Studio, Playground, player), and is never the slide's background or
  an `image` slide's panel. `lint:deck` warns on each one wherever it stands (a line of its own, a sentence, a list item, a
  quote, a table cell, a heading; any case), because while one is on a slide no other picture becomes its photo. `--fix`
  rewrites a slide's one `![bg]` when it stands alone on its line: Markdown's picture, `![A name](photo.jpg)`, with the slide's
  class saying where it goes (`image`, `image mirror`, or `bleed` for a background). It leaves the line for you, and says why,
  when the rewrite would lose the photo: two `![bg]` on one slide (Marp stacks them; a slide places one photo), a `![bg]` that
  shares its paragraph with text, or another picture already alone on the slide.
  Export-to-Marp still writes `![bg]`, because Marp reads it. The `bg-side-unread` and `bg-ratio-unread` lint rules are
  retired with it. **Security note:** the scheme allowlist used to drop a `![bg]` at an `http:`, protocol-relative (`//host`),
  `blob:` or `ftp:` address, with a `meta/url-scheme` diagnostic. It is an ordinary picture now, held to the same policy as
  any `![x](…)`: the preview shows a placeholder until the reader allows the site, the CLI export leaves it out unless run
  with `--allow-remote`, and `web-image` reports it (every one, since each loads). `javascript:` and `file:` are still refused
  by markdown-it. The photo a slide places still follows the allowlist.
- The Studio's photo-contrast check now runs on a slide whose photo is Markdown's picture or a record; it armed only on a
  `![bg]` line, so a swept deck's photos went unchecked. Its photo-size prefetch measures the photo each slide places, asked
  of the same rule, instead of `![bg]` lines.
- A Library photo whose description starts with "BG" is placed as the slide's photo; its description read as Marp's keyword.
- The Studio's chat is told to write a photo as a named `![…](…)` on an `image` or `bleed` slide and never `![bg]`, and the
  `image` layout's skeleton no longer says "bg image".
