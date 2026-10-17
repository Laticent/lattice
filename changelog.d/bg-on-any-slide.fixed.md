- **Fixed: a `![bg]` on a slide that is not `image` draws in CLI exports.** The Studio always showed
  it as the slide's full-bleed background; the CLI turned it into a panel that only the `image`
  layout positions, so the picture drew nothing in the PDF, the HTML or the player. Both now render
  it the same way. A running `<!-- class: image -->` directive still places a picture beside the text.
- **Added: `lint:deck` warns when a `![bg]` keyword does nothing.** `left` or `right` on a slide that
  is not `image` (the picture fills the slide instead), and a ratio such as `left:40%`, which is not
  read. Each warning names the fix.
- **Fixed: a class directive written across lines places a `![bg]` beside the text.**
  `<!--\n_class: image\n-->` is applied by the engine, but the CLI read only one-line directives, so
  the picture filled the slide instead. A front-matter `class: image`, which the engine does not
  apply as a deck class, no longer leaves an empty panel on the slide.
