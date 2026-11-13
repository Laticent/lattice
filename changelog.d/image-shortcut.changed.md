- **Markdown's picture is the image record's shortcut.** On a slide that places a picture (an `image` slide, `image mirror`,
  a `bleed` slide), `![title](src "description")` alone on its line is now placed exactly like `@image{src, title=…,
  description=…}`: the slide's photo panel or background, with the same words for a screen reader. Before, it drew a bare
  picture in the text. Anywhere else it is still an ordinary picture; the record is what takes a frame, a finish, a tone, a
  size or `show=`. `sample:` and `asset:` names work in both. Export-to-Marp writes such a picture as `![bg]`, as it does the
  record. Only a slide's ONLY lone picture is placed, and only one that is the slide's own paragraph: two pictures, or a
  picture in a list or a quote, stay ordinary pictures, and so does one on a slide that already has a `![bg]` photo or a
  record (a logo beside a `![bg]` photo stays in the text column), one at an `http:` address, or one whose alt starts with
  Marp's `bg` keyword in any case. A deck-wide `class: bleed` makes that one picture every slide's
  background, as it already did for the record. One shipped deck moves: `styles-device-check`'s web-image slide shows its blocked picture as the panel.
- The Reading view (the article built from a deck) shows an `image` slide's photo and a `bleed` slide's background as a
  figure after the lead paragraph, when the picture is written as `![…](…)` or `@image{…}`. A Marp `![bg]` picture stays out
  of the article, as before, and so does a picture with no title (it is decorative).
