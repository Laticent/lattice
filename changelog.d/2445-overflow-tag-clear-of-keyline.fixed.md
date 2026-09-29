- **Fixed: the overflow tag no longer sits on a framed finish's keyline.** On a slide that
  overflows, the "Content clipped" tag (and the author's "Overflows" tag) sits in the strip
  below the footer, and the frame keyline of `finish: gallery` or a Fabricate frame edge ran
  straight into both of its sides in every export. The keyline now stops short of the tag,
  0.8 cqi on each side. Slides that fit are unchanged.
