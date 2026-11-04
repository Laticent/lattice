- **`lint:deck` warns on raw HTML and CSS the preview blocks.** `web-image` now also names a web address in raw HTML
  (`<img src>`, `srcset`, `<video poster>`, SVG `<image href>`, `<link href>`, a refresh `<meta>`), in a `style`,
  `<style>` or `@import`, in a style directive (`backgroundImage`, `color`, …), in a `<style>` inside `<svg>`, in the front matter's `style:`, and in a Mermaid diagram.
  Three new warnings join it: `web-request` (`ping`, `action`, `formaction` to another site), `stripped-markup`
  (`<script>`, `<iframe>`, an `on…=` handler, a `javascript:` address) and `style-ends-early` (a `</style` in the front
  matter's `style:`), plus `markup-unsure` for markup a browser may read differently. The video plugin adds
  `video-web-poster`. Each finding names the exact address. All are warnings, so `lint:deck --strict` fails on them.
- **A repeated front-matter `header:` is read the way the engine reads it.** `web-image` used to check the first
  `header:` or `footer:` and the engine draws the last; it now checks the last.
