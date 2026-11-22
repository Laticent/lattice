- **`backdrop:` gains two keep-outs for pattern finishes, `clear-footer` and `clear-hero`.**
  `clear` empties the whole content box, which suits a wash and throws a pattern away. The
  keep-outs leave a grid, dot or ruled finish running behind the content and clear only the
  footer band (the footer text, the section rail and the page number), and with `clear-hero`
  the content box of a `big-number` slide too, so the pattern never runs under the hero number. On a split slide the band also clears the panel's
  own copy of the finish under the page number.
  They use the same soft clear layer as `clear`, so an exported PDF keeps every word as text.
  Write `backdrop: clear-hero` in the front matter, or `_class: backdrop-clear-footer` on one
  slide; the Studio's backdrop mask menu lists both. `clear` is unchanged. Demo:
  `examples/backdrop-keepouts.md`. (`lib/core/resolve-backdrop.js`, `lib/base/base.finish.css`)
