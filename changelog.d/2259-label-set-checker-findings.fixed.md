- **`parseInlineSet` no longer backtracks super-linearly on a brace run of spaces.** The
  member regex paired an ambiguous `\s*` against a lazy `[^,{}]*?`, so `` `[{<3000 spaces>}]` ``
  took **10.9 seconds** to reject. Survivable while one chart read the grammar from a known
  position; not survivable once `lint-core` began calling it on every lone code span, because
  lint-core is bundled for the browser and the Studio lints UNTRUSTED markdown (shared and
  AI-generated decks, HARD RULE #22) synchronously on the main thread. Dropping the `\s*`
  removes the ambiguity — `tidy()` already trimmed both captures — so the accepted language
  is unchanged and 20,000 spaces now reject in under a millisecond.
  (`lib/core/label-set.js`)
- **The two render paths printed different words for the same label.** `applyToDom` re-wrapped
  the DOM's already-decoded `textContent` into synthetic HTML and ran it through `plainText` a
  second time, so an author writing `` `[{[x], A &amp; B}]` `` got `A &amp; B` from the
  exporter and `A & B` from the live preview, and `<b>bold</b>` lost its tags on one path only.
  The DOM arm now calls `parseInlineSet` on the element's own text (HARD RULE #1).
- **The two paths also disagreed on a section with no table** — the HTML arm lifted the set
  paragraph before looking for the grid and the DOM arm after, so a mid-draft slide had the
  paragraph eaten by the exporter and printed raw by the preview. Same order on both now.
- **`matrix-grid`'s key is legible in grayscale.** Its two swatches were separated by hue and
  hairline weight alone and, desaturated off the committed gallery PDF, read as the same box —
  less legible than the grid they decode. `not applicable` is now dashed, which survives
  grayscale, print and every a11y palette, and says the right thing about the shape it names.
- **A label set no longer trips the `verbose-eyebrow` budget.** It takes an eyebrow's exact
  shape — a lone code span above the heading — so authors were told to shorten a machine-read
  key. Same exclusion, and the same reasoning, as `isQuadrantAxisEyebrow`.
  (`lib/authoring/prose-budgets.js`)
- **`lint:deck` warns when a key is named twice**, which last-wins silently and leaves the
  rendered key one row shorter than what was typed.
- **The lint's own advice now names the keyed components from the catalog**, not from a
  hard-coded string — that string was the drift the manifest field was bought to prevent,
  reintroduced one layer down.
- **`roadmap`'s load-time label lookup fails legibly.** An unguarded `.find(...).label` would
  have thrown `undefined` at require time, and the generated chart registry requires every
  chart eagerly — so one missing manifest member would have taken out all 22 charts and the
  runtime bundle with a stack trace naming none of it.
