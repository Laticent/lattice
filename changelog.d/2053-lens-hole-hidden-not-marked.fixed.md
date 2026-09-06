- **Fixed: two lines of author CSS un-hid every withheld slide, and the export shipped them as blank
  pages.** `<style>section.lens-hole { display: block !important }</style>` on a slide the view keeps
  turned a `brief` export of a 5-slide deck into a FIVE-page PDF, blank at positions 2 and 4 — the
  deck's real length and the exact withheld slots, in the file, from a deck that never names a
  withheld slide. Exit 0, one line under the CLI's own "brief — 3 of 5 slides ship". The engine's
  hiding rule cannot reliably win: the engine sheet is INLINED into the exported document, so it is
  author origin too, and an `!important` tie at equal specificity is decided by SOURCE ORDER — which
  a deck's own `<style>` can take. (Not "by origin", which an earlier draft of this fragment and the
  refusal message both said. Measured false: `section { display: block !important }` — author,
  `!important`, lower specificity — does not un-hide a hole. `base.lens-hole.css`'s header had it
  right the whole time, while naming the wrong guard for it.) `holeDrift` was silent because the class was all still there — it asks
  which slides carry the marker, and un-hiding one leaves the marker alone. **The export now checks
  the PROPERTY, on the laid-out document:** a hole that generates a layout box refuses, which catches
  `display`, `visibility: hidden` and `opacity: 0` alike, since the last two take a blank page too.
  The two checks are kept separate because they answer different questions — a forged hole carries
  the class and has no box, an un-hidden one has both.
- **Fixed: a slide the deck hides with CSS no longer disagrees silently with the count.** The other
  direction of the same measurement. Under a reader view it refuses: the run has just printed how
  many slides ship, so an artifact with fewer pages breaks the projection's own contract. Without one
  it warns — un-gated by `--quiet`, like the other privacy notice — because hiding a slide with CSS
  is something a deck could always do and this is not the place to start refusing it. What it must
  not do is let the count line lie: `section:nth-of-type(2) { display: none !important }` in front
  matter printed "HTML: 3 slides" over a 2-page PDF. (The `!important` is load-bearing in that
  example and an earlier draft omitted it: without it the engine's own rule still wins and the slide
  renders, so the line as first written did not reproduce.)
- **Fixed: the CLI refused its own output.** A projected deck is markdown and the envelope of a
  shared player carries it verbatim, so re-rendering it is the obvious thing to do with it — and
  every re-export was refused, under a message that was FALSE for that file ("its text still ships in
  the .html") when the projection had already removed the text. A chunk that IS the projection's
  empty hole body, byte for byte, is now an expected hole; a hole with anything under it — a heading,
  a paragraph, a speaker note — is not, which keeps every case the refusal was written for. Byte
  equality rather than "looks empty": stripping comments and checking for leftovers reads
  `<!-- note: … -->` as emptiness, and a speaker note is exactly what a withheld slide is withheld for.
- **Fixed: one hole predicate, three answers.** Centralizing the four hole predicates fixed their
  spelling and not their semantics. `isHoleOpenTag` matched `\blens-hole\b`, a substring test that
  runs across a hyphen, while `holeDrift` and the stylesheet both matched a whole class token — so an
  ordinary author class `lens-hole-note` was a hole to the CLI's slide filters and content to the
  integrity check: a 3-slide deck shipped an `.html` claiming 2 slides, dropped that slide's PDF note
  annotations, and mislabeled it in the sidecar, at exit 0 and past `holeDrift`. And
  `isHoleSectionHtml` was an alias for it, applied to the whole section string — so the first
  `class="…"` it found could be a `<div class="badge lens-hole">` in ordinary author markup, which
  bound one slide's private speaker note under the next slide in the notes sidecar and the PPTX. Both
  now read the section's own class attribute as a token, and the section predicate cuts the open tag
  out rather than hoping it comes first.
- **Fixed: the visibility check read the wrong medium, so one `@media print` line reopened the leak.**
  The check measured `getClientRects()` in the page's default medium — SCREEN — and `page.pdf()`
  renders in PRINT. So `<style>@media print { section.lens-hole { display: block !important } }` was
  passed straight through: `brief — 3 of 5 slides ship`, exit 0, and a **five-page PDF blank at
  positions 2 and 4**, which is verbatim the disclosure the check had just been written to close. The
  mirror passed too — a print-only rule hiding a KEPT slide gave a 2-page PDF from a 3-slide view with
  no warning. `@media print` is ordinary authoring here, not an attack: `lib/base/base.finish.css`
  flips its own slots under it. The document is now measured in BOTH media and the readings are
  UNIONED, because both ship — the `.html` deliverable is read on screen and the PDF is printed — so
  a hole showing in either is a disclosure. Swept over every deck in `examples/` for false alarms.
- **Fixed: and measuring both media still could not close the class, so the check moved to the
  artifact.** A `beforeprint` handler un-hid every hole from inside the real print flow — after every
  measurement and after media emulation, which the event does not fire on — giving the same five-page
  PDF at exit 0. No pre-print measurement can close that, which is the same lesson the four CSS
  detectors taught: a proxy for the artifact has an unbounded complement. So the PDF's OWN page count
  is now compared with the pages the run said it was shipping, after `page.pdf()` and before the bytes
  are written. That subsumes every print-time vector at once, including ones nobody has thought of,
  because it asks about the only thing that ships. Under a reader view a mismatch refuses; without one
  it warns, un-gated, on the same policy as the rest of this check. Swept over all 152 decks in
  `examples/` for false alarms; auto-split decks (33 pages from fewer slides) are unaffected, because
  the expected count is read off the rendered DOM, not from `kept.length`.
- **Fixed: the two-media reading collapsed split slides, which was fail-open.** `data-authored-slide`
  is not unique — a heading-split slide renders as several sections carrying the same number — so
  joining the screen and print readings through a `Map` keyed on it kept only the LAST page of that
  slide and judged every earlier page by its sibling. Measured: a 3-slide deck whose slide 1 splits,
  with a print-only rule hiding the FIRST page, went silent, while hiding the continuation warned
  correctly; under a reader view the refusal never fired at all. The two readings are zipped by
  position now — same query, same order — and the reported numbers are de-duplicated, so a split slide
  is named once instead of as "slides 1, 1".
- **Measured: the raster formats are immune to both print-time attacks.** Both adversarial lenses
  reasoned this and neither ran it, so it stood in their reports as "could not verify". PNG, PPTX and
  the image set screenshot the SCREEN document and never invoke printing, so a `beforeprint` handler
  never fires for them — measured: 3 images and 3 PPTX slides from a 3-slide view under the same
  payload that gave the PDF five pages, with no withheld text anywhere in the package. A `@media
  print` un-hiding IS caught on those paths, by the print-media half of the visibility check. Pinned,
  because a negative that holds by construction holds only while the construction does, and these
  formats have no artifact-level count check behind them the way the PDF now does.
- **Fixed: a script that strips the hole class defeated all three checks at once.**
  `setTimeout(() => { for (const e of document.querySelectorAll('.lens-hole')) e.classList.remove('lens-hole') }, 0)`
  removes the marker from the LIVE page, and every guard missed it for a different reason: `holeDrift`
  reads the rendered HTML **string**, before the browser sees it; the visibility check asks whether a
  HOLE has a layout box, and after the strip there were no holes to ask about; and the artifact
  page-count check compared the file against a count taken from that same mutated DOM, so both sides
  moved together and agreed. Measured: `brief — 3 of 5 slides ship` followed by `PNG: 5 slides`, exit
  0 — five images for a three-slide view, two of them the withheld positions. **A promise derived from
  the thing being checked is not a promise.** The withheld set is now taken from the projection — the
  source, which no script in the page can reach — and the live DOM is held to it. Refused on all four
  formats, nothing left on disk.
- **Added: every format now asserts its own finished artifact against what the run promised.** The PDF
  gained this in the ninth round; PNG, PPTX and the image set were still resting on a pre-render
  measurement. Each now counts what the file CONTAINS — the PDF's page tree, `ppt/slides/slideN.xml`
  out of the written package, the images on disk, the manifest's own slide list — rather than the
  buffer list that produced it, which would be the artifact certifying itself. Refuses under a reader
  view, warns un-gated without one: a deck that moves its own page count at render time is something a
  deck could always do, but the count line must not lie about it.
