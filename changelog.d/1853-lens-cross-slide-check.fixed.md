- **Fixed: the cross-slide check refused a third of real decks, and missed the leak it was built for.**
  It compared each kept slide against its render in the FULL deck, which differs on every correct
  projection — a shorter deck renumbers its pages, shortens its divider dot rail, restarts its
  section-number ghost, shifts the categorical accent and renames its SVG defs ids. Measured over the
  147 decks in `examples/` that can be projected at all (150 files, less two with no front matter
  and one under three slides), that refused 52: a guard that is an outage. The
  comparison now goes through a middle term — the deck at its ORIGINAL length with the withheld
  bodies emptied — so deck length is held fixed and the only thing that can differ is what a withheld
  slide was contributing. A second hop compares that stand-in against what actually SHIPS, so the
  check is a statement about the artifact rather than about a proxy for it. Over the same corpus it
  now refuses exactly one deck, `examples/slide-class-forms.md`, which carries a live
  `<!-- class: diagram dark -->` global that a later slide inherits — a true find the corpus test
  pins by name.
- **Fixed: a `<style>` block on a withheld slide is now seen.** A `<style>` is document CSS wherever
  it is written, so `section[data-authored-slide="0"] p:nth-of-type(2) { display: none }` on slide 1
  hides a paragraph on slide 0. Dropping the slide that carried the rule UNHID the paragraph in the
  file that was sent, while the sender previewed it hidden. A section-by-section comparison cannot
  see this — the kept slide's markup is byte-identical on both sides, and only the stylesheet moved —
  so the check gained a second channel over the document's `<style>` text.
- **Fixed: an author's own `</section>` no longer truncates the comparison.** The walk was
  `/<section[\s\S]*?<\/section>/`, which stops at the first `</section>` in the markup. A
  `<section class="aside">` written inside a slide ended the match there, and everything after it on
  that slide went unchecked. The walk is now `splitSections`, the repo's depth-aware splitter.
- **Fixed: `--lens-source full` said "4 of 8 slides ship" while shipping all 8.** That flag puts the
  whole deck's markdown back into the embedded envelope, so the line described the artifact the
  sender expected instead of the one they sent. It now names both numbers.
- **Fixed: a reader view that drops the cover refused on every deck.** The comparison above runs
  against a same-length stand-in for the projection, and the stand-in blanked a withheld slide to an
  empty line. On slide 0 that makes the deck body open with a separator, which renders one section
  fewer — Marpit's leading-group rule — so every authored number shifted by one and each kept slide
  was compared against a different slide. Measured: withholding slide 0 refused 147 of 147 example
  decks, and `examples/lens-export.md --lens ask` — the deck this feature ships to demonstrate
  itself — refused on the real CLI with no cross-slide state anywhere in it. A withheld body is now
  an empty comment, which the splitter counts and the render discards, and the stand-in's slide
  numbering is CHECKED against the full deck's before anything is compared through it; a mismatch
  reports itself as a defect in the checker rather than as a `footer:` the author never wrote. The
  corpus measurement that missed this ran one projection shape — every other slide, which always
  keeps slide 0. It now runs six, three of which drop the cover.
- **Fixed: the dot rail was stripped with the lazy regex two other modules refuse by name.**
  `lib/core/split-envelope.js` and `lib/diagnostics/slice-equivalence-core.mjs` both write down why
  `/<div class="tile-progress"[\s\S]*?<\/div>/` is wrong — the rail is a nestable tag, so the match
  ends at the first inner `</div>` — and both take the depth-aware `matchingDivClose`. This now does
  too. Latent today, since the dots are `<span>`s; a test drives it through the injected renderer,
  which is the only way to reach a guard no real deck can trip.
- **Changed: the neutralizer list is named and pinned.** Every entry blinds the comparison a little
  further and the list only grows, so the eight axes are exported as `POSITION_NEUTRALIZERS` with a
  reason each and pinned by a test — the same discipline `slice-equivalence-core.mjs` applies to its
  own set, for the same reason.
- **Fixed: `<STYLE>`, `<script>` and `<link>` were all outside the document channel.** HTML tag names
  are case-insensitive and a browser applies `<STYLE>` exactly as it applies `<style>`; matching
  lowercase only walked the changelog's own worked example past the channel built for it on one
  shifted character. `<script>` and `<link rel="stylesheet">` reach every slide the same way a
  `<style>` does — a withheld slide's script removing a paragraph from a kept one was measured doing
  it — and neither is a `<style>`. The channel now reads all three, whole element including the
  opening tag, so a changed `src` is a difference and not just a missing one.
- **Fixed: an author could delete a slide out of the comparison with one line.** The dot-rail
  neutralizer matched from `<div class="tile-progress"` to a closing `</div>`, and the class name
  ships in `dist/lattice.css`. A bare marker written above a paragraph borrowed the engine's own
  closing tag and took the paragraph out of both channels: measured, that turned a caught
  link-reference degradation into a clean export. The rail and the section-number ghost are now
  matched by the exact markup the renderer emits, which can only ever remove what it matched. A
  change to the rail's own shape stops the pattern matching and the rail comes back into the
  comparison — loud, which is the direction a guard should fail in.
- **Fixed: the accent neutralizer was erasing evidence.** `\bcat-\d+` ran over the whole section
  including rendered TEXT, so a footer that really did change from `cat-9` to `cat-3` between the two
  renders compared equal — a global-directive drift the previous check caught and this one had lost.
  It is now anchored to `class`/`data-class`/`style` attribute values and `--…cat-N` custom
  properties, where an accent actually lives.
- **Fixed: both checks certified a document nobody receives.** Three source transforms run downstream
  of where they sat — `withPrintColorMode`, `preprocessMermaid` and `appendAutoGlossary` — so every
  baked diagram was outside both, and `glossary: auto` appended a slide after the check: the CLI
  reported "2 of 3 slides ship" and wrote a three-slide file carrying an authored index nothing had
  verified. The checks now run against `rawMd`, the source the pipeline actually renders, and still
  before any byte is written. The glossary case is now refused.
- **Fixed: one character in a close tag walked past the document channel.** HTML's RAWTEXT end-tag
  state closes a `<style>` on `</style` followed by whitespace, a SLASH, or `>` — so `</style/>` and
  `</style x>` are real close tags, and matching only `</style\s*>` was a subset of the rule rather
  than the rule. Measured: the same deck with the same `display: none` rule refuses when the close is
  spelled `</style>` and exports clean when it is spelled `</style/>`, with the hidden sentence
  rendering at 770×36 pixels in the file that ships and absent from the PDF the sender previewed. It
  evaded the author-CSS scan by the same regex, so one deck walked past both render-independent
  checks at once. `<script>` had it too.
- **Fixed: `glossary: auto` made every reader view unexportable, `--lens full` included.** Moving the
  checks downstream so they would see the shipped document made them see the appended glossary slide
  and read it as an unmarked page-multiplier — refusing the identity export this kernel promises is
  byte-identical to no flag at all, with a message telling the author to hunt a rule that turned one
  slide into several. An appended slide extends the numbering past the view map rather than shifting
  it, so it belongs to no view and cannot misdirect one; the count is derived by splitting both
  sources rather than by naming the transform, so the next appender is counted without being named.
  The report line now says so too — "2 of 3 slides ship" beside a three-slide file described neither.
- **New: CSS that picks a slide by its number is now checked, in a real browser.**
  `section:nth-of-type(3) p { display: none }` lands on a different slide once a projection makes the
  deck shorter — a paragraph the author hid comes back in the file that ships (measured: `display:none`
  and 0x0 in the preview, `display:block` and 770x36 in the export), and an `::after` classification
  marking drops out of the exported PDF entirely (`pdftotext` 1 to 0). Comparing two renders cannot see
  it: the stylesheet is byte-identical on both sides and so is every slide's markup. So the export
  renders the deck both ways and asks the browser which slides each of the author's rules matches,
  requiring the second answer to be the first mapped through the kept set. Nothing is parsed, so
  `:is()`, `:has()`, CSS escapes and attribute selectors on `id` or `data-lattice-pagination` are all
  covered by construction — every one of them a spelling the scanner this replaced walked straight
  past. Measured end to end on the real CLI: 8 of 8 leaks refuse, 14 of 14 idioms real authors write
  ship, including `* + *` and `li:nth-child(2)`, both of which the scanner refused.
  It is gated on the deck carrying CSS at all — 2 of the 150 decks in `examples/` — so a deck without
  it pays nothing (1.7 s either way; 6.2 s when the check runs). A slide-body `<style>` is read off the
  PARSED document, never the markdown, so a ```css fence teaching an example contributes nothing.
  A `readGlobalStyle` copy is no longer local to the CLI: the export and the document are built from
  the one reader, so they cannot disagree about whether a deck carries CSS. Closes #2053.
- **Fixed: the CSS refusal said "Nothing was exported" while the file sat on disk.** For `.html` the
  deliverable is written at top level, well before the async entry point where a check that needs a
  browser can run — so the one reader-view refusal that happens late left a complete, working export
  at the output path while telling the author nothing had shipped. It now unlinks first, taking the
  same exit the render-failure path beside it already takes for the same reason: absence is the honest
  outcome. The earlier reader-view checks are unaffected — they run at the source, before any write.
- **Changed: `--lens full` no longer pays for the browser.** An identity projection keeps every slide
  in place, so no selector can land anywhere new; the check now returns before rendering anything.
  Measured: 6.0s back to 1.6s, which is what an export with no flag at all costs.
