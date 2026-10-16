- **Fixed: a `![bg]` on a slide that is not `image` draws in CLI exports.** The Studio always showed
  it as the slide's full-bleed background; the CLI turned it into a panel that only the `image`
  layout positions, so the picture drew nothing in the PDF, the HTML or the player. Both now render
  it the same way. A running `<!-- class: image -->` directive still places a picture beside the text.
- **Added: `lint:deck` warns when a `![bg]` keyword does nothing.** `left` or `right` on a slide that
  is not `image` (the picture fills the slide instead), and a ratio such as `left:40%`, which is not
  read. Each warning names the fix.
