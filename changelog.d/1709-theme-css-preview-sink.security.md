- **Theme CSS can no longer break out of a preview frame.** A Theme Studio theme's
  `label` and `description` — free text, model-populated in the normal flow — landed
  unescaped in the emitted stylesheet's comment header, and the composed sheet is
  concatenated into a same-origin, un-sandboxed preview `<style>`. Because a `<style>`
  element's content is HTML RAWTEXT, a `</style>` carried in that text ended the element
  and the remainder was parsed as markup in the live frame — script execution in the
  origin that holds the user's own OpenRouter key. Closed on both sides: the serializer
  neutralizes the CSS comment terminator in both fields, and every preview-frame builder
  now passes its stylesheet through the new `sanitizeStyleText`, which escapes the element
  terminator only. Verified pre/post on the shipped bundle in Chromium 131. (#1709)
- **HARD RULE #22 and its `build:check` gate now cover the stylesheet channel**, not just
  the markup one. A preview builder that embeds a `<style>` element must sanitize what
  goes in it; builders with no stylesheet channel are unaffected.
- **A caller-supplied `--css` layout sheet's `@import` is no longer lost to a comment
  opener inside a string.** `flattenCssImports` scanned with a naive comment regex, so
  `content: "/*"` earlier in the sheet swallowed every `@import` up to the next real
  comment close and the parent silently did not inline. It now uses the same comment walk
  the rest of the engine does. The import grammar is unchanged.
