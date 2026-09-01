- **The preview sanitizes faster, and stops re-sanitizing bytes it has already
  sanitized.** `sanitizeSlideHtml` configures DOMPurify once instead of on every
  call, which is ~0.8ms off every slide at a 4x CPU throttle (26-40% of the call,
  measured in real Chromium) on every route — including typing, where the
  HTML is new by construction. On top of that, the single-slide preview keeps a
  bounded memo of what it has already sanitized, keyed on the whole HTML string,
  so revisiting a slide — rail navigation, the overview grid's second pass,
  Present walking back, or an edit to a slide you are not looking at — costs no
  DOMPurify pass at all. Output is byte-identical; nothing reaches a preview
  frame unsanitized.
