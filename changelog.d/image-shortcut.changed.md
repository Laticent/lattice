- **Markdown's picture is the image record's shortcut.** On a slide that places a picture (an `image` slide, `image mirror`,
  a `bleed` slide), `![title](src "description")` alone on its line is now placed exactly like `@image{src, title=…,
  description=…}`: the slide's photo panel or background, with the same words for a screen reader. Before, it drew a bare
  picture in the text. Anywhere else it is still an ordinary picture; the record is what takes a frame, a finish, a tone, a
  size or `show=`. `sample:` and `asset:` names work in both. Export-to-Marp writes such a picture as `![bg]`, as it does the
  record. Only a slide's ONLY lone picture is placed, and only one that is the slide's own paragraph: two pictures, or a
  picture in a list or a quote, stay ordinary pictures. A deck-wide `class: bleed` makes that one picture every slide's
  background, as it already did for the record. One shipped deck moves: `styles-device-check`'s web-image slide shows its blocked picture as the panel.
- The Reading view (the article built from a deck) shows an `image` slide's photo and a `bleed` slide's background again, as
  a figure after the lead paragraph, whichever way the picture was written (`![…](…)`, `@image{…}` or `![bg]`). A photo drawn
  as the slide's panel used to be left out.
