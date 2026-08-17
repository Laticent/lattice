- **Theme and component CSS can no longer break out of the element it is embedded in.** A
  Theme Studio theme's `label` and `description` — free text, model-populated in the normal
  flow — landed unescaped in the emitted stylesheet's comment header, and that sheet is
  concatenated into a same-origin, un-sandboxed preview `<style>`. Because a `<style>`
  element's content is HTML RAWTEXT, a `</style>` carried in CSS text ended the element and
  the remainder was parsed as markup in the live frame — script execution in the origin that
  holds the user's own OpenRouter key. Closed on both sides: the serializer neutralizes the
  CSS comment terminator in both fields (losslessly — no character is dropped), and every
  module that assembles a document now passes its stylesheet through the new
  `sanitizeStyleText`, which escapes the element terminator and nothing else. Verified
  pre/post on the shipped bundle in Chromium 131. (#1709)
- **The same guard now covers the Share → Webpage export.** Its self-contained document is
  mounted in a same-origin frame inside the docs site before it is downloaded, and a
  `</style>` in saved component CSS could pull an external stylesheet into that origin *and*
  bake it into the shipped file. The embedded-fonts block and the baked-finish `<style>`
  spliced into exported markdown are guarded too. Exported bytes are unchanged for every real
  deck — the guard returns its input unmodified unless the CSS actually contains `</style`,
  which none of the repo's 179 committed stylesheets does.
- **HARD RULE #22 and its `build:check` gate now cover the stylesheet channel**, not just the
  markup one, and discovery is keyed on assembling a whole HTML document rather than on the
  preview-frame idiom — which is what let the export assembler slip past.
- **A caller-supplied `--css` layout sheet's `@import` is no longer lost to a comment opener
  inside a string.** `flattenCssImports` scanned with a naive comment regex, so `content: "/*"`
  earlier in the sheet swallowed every `@import` up to the next real comment close and the
  parent silently did not inline. It now uses the same comment walk the rest of the engine
  does — which also learned that `url(…/*…)` and a string ending at a raw newline (including a
  form feed) are not comments. The import grammar is unchanged.
