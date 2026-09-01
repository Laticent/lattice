- The docs e2e case that proves the Vetrina stage inherits the host's `--vt-*` tokens reads them as
  colors rather than as strings. astro 7's CSS minifier rewrites author color literals — the page's
  `rgb(20, 120, 220)` ships as `#1478dc` — and a custom property's computed value is the token
  stream that survived the build, not a parsed color, so a literal comparison went red on a
  difference that is purely serialization. The rendered page is unchanged; astro 6 and astro 7
  renders of the Studio, Playground and landing compare pixel-for-pixel equal at all three widths.
