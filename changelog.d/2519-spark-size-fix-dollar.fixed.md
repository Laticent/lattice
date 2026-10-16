- The `spark-too-big` one-click resize keeps `$&` and `$'` in a span as written; it built its
  replacement with a string pattern, which would have spliced the matched span into the fix.
- A carousel page whose card title holds `$&` or `$'` (`**Cost $& more.**`) keeps it in its
  page label; the label was spliced in with a string replacement, which turned `$&` into `<section`.
- Author text holding `$&` or `` $` `` no longer corrupts the markup around it in three more places
  that spliced it in with a string replacement: a split-panel slide's class words (the section got
  two `class` attributes), a QR code's label, and the recorded address of a blocked web image in a
  shared or presented deck.
- The same fix for a `meta:` front-matter value (the masthead tile) and a roadmap's status cells
  and horizons cards: `$&` or `` $` `` in the author's text no longer pulls page markup into the slide.
