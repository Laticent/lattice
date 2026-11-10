- **Compose's Placement control sets the slide, not the picture.** Picking Left side, Right side, Full slide or the new In the
  text for a picture alone on its line makes the slide `image mirror`, `image`, `bleed` or a plain content slide, and the
  picture stays an ordinary `![title](src)`; Compose no longer writes Marp's `![bg …]` keywords. An old `![bg …]` picture
  loses them the first time it is placed, and its description becomes its name (once, not as name and description both). Its other keywords go too, so a
  `contain` picture becomes cover-cropped.
  The control shows on the slide's one lone picture on a content or image slide, a modifier-only slide (`_class: dark`)
  included, not only on a `![bg]` one; it is not offered where the engine would not place the picture (a `![bg]` photo or a
  record already on the slide, an `http:` address), nor under a carried `<!-- class: … -->`, whose placement the badge now
  shows; a slide with a layout of its own, or a class written in a compound
  comment, is left to the Markdown editor. The picture's badge says where it sits (Panel · Right, Background).
- The Studio's card-ink and photo-contrast checks find a slide's photo however it is written: `![bg]`, a lone `@image{…}`
  record, or the `![…](…)` shortcut on an `image` or `bleed` slide.
