- **Fixed: the export told authors a family of selectors was safe, and three of them break.** The
  warning read "Selectors that COUNT SLIDES are safe here". Measured in real Chrome on real exported
  files, an 8-slide deck keeping 1/4/6/8: `:nth-child(3 of .kpi)` landed on slide 6 in the whole deck
  and matched **nothing** in the projection; `section:has(blockquote) + section` matched two kept
  slides and then none; and `section:not(:has(blockquote)) + section` matched only kept slide 8 in the
  whole deck and matches **4, 6 and 8** in the projection — it GAINS two slides, so a rule that HID
  something in the deck the sender previewed can UNHIDE it in the file they send. The boundary is not "positional CSS": a hole keeps the withheld
  slide's SLOT and carries nothing else — not its class list, not a byte of its content — so counting
  slots holds and asking a question ABOUT a slot does not. Not closable by trying harder, and the
  reason is worth stating: the only hole that could answer these the way the withheld slide did is one
  carrying that slide's classes and content, which is the disclosure the projection exists to prevent
  (a class name is author text — `_class: acquisition-terms` names the thing). The warning, the
  kernel's docblock and the channel table now say all three families, with the measurements.
- **Fixed: two rows of the "MEASURED" channel table certified nothing.** Comparing the projection
  against the whole deck shows a row AGREEING; it cannot show the row would have noticed disagreement.
  `last-of-type` lands on slide 8 with or without the holes, and `nth-of-type(1) ~ section` matched
  every slide but the first, which the restrict-to-kept filter reduced to exactly the kept set on both
  sides. The table now compares a third document — the projection with the holes deleted, i.e. "position
  holding stopped working" — and every row that claims to discriminate must answer differently there.
  One row is marked BLIND rather than dropped: it is preserved AND it cannot tell the difference, and a
  reader will reach for it, so it says so out loud.
- **Fixed: an inline `<!-- caption: -->` was spoken over the wrong slide.** The sixth
  authored-vs-shipped pairing bug in this feature. `slideCaptions` is extracted from the AUTHORED slide
  array and `mergeNarration` reads `captions[i]` at the PAGE index, so the two spaces differ by every
  hole in front of a slide — and by every extra page a split produced, which was already true before
  holes existed. Measured on a 5-slide deck whose `brief` view keeps 1/3/5: page 2 fell back to
  generated speech and page 3 spoke SLIDE 3'S CAPTION OVER SLIDE 5, which is verbatim the misnarration
  `pruneCaptions` was written to kill, still live through the other caption channel. Both channels now
  go through the join this file already owns, `asShippedSlides`.
  **The first attempt at this fix was wrong, and the case that caught it is the one no round had
  reached: a SPLIT crossed with a projection.** Give slide 1 a second heading and the default split
  mode cuts it in two, so the authored slides (5), the rendered sections (6) and the pages (4) are
  three different index spaces at once. `captions` is indexed by the middle one — one entry per
  section the engine emitted, holes and continuations included — so treating it as authored-indexed
  looked two captions up at HOLE positions and dropped them on the floor, trading one wrong answer
  for another. Measured on that deck: `captions[page]` gives `CAPONE · — · — · CAPTHREE`,
  `captions[authored]` gives `CAPONE · CAPONE · — · —`, and `asShippedSlides(captions)` gives
  `CAPONE · — · CAPTHREE · CAPFIVE`. The empty second page is slide 1's continuation, whose caption
  comment lives in the first half; it is filled from the same authored slide, which is the rule the
  front-matter channel already applies to a split. That crossing is now a test.
- **Fixed: a deck that DOCUMENTS the hole marker lost its chart narration.** `isHoleSourceChunk` tested
  whether a chunk CONTAINS `<!-- _class: lens-hole -->`, which is unanchored and fence-blind: a slide
  explaining reader views inside a ```md fence counted as a hole, the source and rendered section
  counts diverged, and chart narration stood down for the whole deck — under a message blaming the deck
  for a divergence the filter had just introduced. The predicate is now equality against the
  projection's hole body, which is the same question `emptyHolePositions` asks.
- **Fixed: two privacy notices were silenced by `--quiet`.** The auto-glossary appendix is built from
  the deck-wide `acronyms:` registry, which the projection does not prune — so a term defined for a
  withheld slide still gets its definition on the appended page — and `--lens-source full` carries every
  slide in the envelope of a file whose pages show a subset. Both rode on the reader-view report line,
  which `--quiet` hides, so the one flag every pipeline passes turned them into no output at all. They
  are warnings now, un-gated, like the author-CSS warning that was deliberately un-gated for exactly
  this reason: a privacy warning `--quiet` hides is a warning nobody reads.
- **Fixed: the generated-deck suite proved one channel and claimed two.** Its own docblock said the
  decks gave the cross-slide check's second hop "two different documents to compare". Re-derived by
  deleting each of the five comparisons in turn: every drift the file ever observed came through the
  document-stylesheet channel, and BOTH per-section comparisons could be deleted with all three arms
  green. The plant was a `<style>`, which the document channel catches — so the arm billed as proving
  the relation is checkable proved the other channel worked. Two arms close it: a markdown LINK
  REFERENCE DEFINITION planted on a withheld slide, which leaves the stylesheet set untouched and
  degrades `<a href>` to literal text on every kept slide that used it (so only the per-section
  comparison can catch it), and a bent render that makes the stand-in disagree with what ships in each
  of the two hop-2 channels. Four of the five comparisons are now killed by this file and the fifth by
  the injected-renderer arm next door; the file carries that table instead of the claim.
- **Changed: a split slide's inline caption now speaks on every page it became — on decks with no
  reader view too.** The caption join above is shared, so the per-page fill reaches any deck whose
  slide paginates, projection or not. Measured on a 5-slide deck with no `--lens`, slide 1 cut in two
  by its second heading: page 2 used to narrate generated speech and now narrates slide 1's caption.
  That matches what the front-matter channel has always done with a split, and it changes exported
  `.vtt` bytes for decks that never asked for a reader view — said here rather than left for someone
  to find in a diff, because the other bullets frame this work as a projection fix and this part is
  not one.
- **Fixed: a withheld view's id printed on the recipient's slide, and nothing said so.** A `_lens` tag
  the author QUOTED — in a ```` ```md ```` fence, an indented block, or backticks — is not a directive:
  the engine never reads it and the prune deliberately leaves it alone, so it renders as text. Measured
  on a deck teaching reader-view syntax: `<!-- _lens: project-chimera -->`, naming a view the export
  does not carry, on the face of the exported PDF, twice, at exit 0. `renderedDirectiveBodies` says it
  asks "what a READER is shown" and read only the two comment token kinds; a reader is shown a fence
  too. It now **warns** rather than refusing, and that split is deliberate: every other placement is a
  directive the author cannot see rendered, while this is prose they wrote and can read on their own
  slide, and the deck that hits it is usually one teaching reader views — which an existing test
  already pins as having to export with its example intact (HARD RULE #29: we warn, we coach). A deck
  quoting a view it DOES carry says nothing.
- **Fixed: the author-CSS warning was silent about the one format that inverts it.** A `--player`
  carrier wraps every slide in its own frame, so each `section` is the only one in its parent and
  every cross-slide selector matches nothing — including the slot-counting ones the warning had just
  called safe. Measured in real Chrome: a `.secret` span that `section:nth-of-type(3) .secret {
  display: none }` hides in the PDF and the plain `.html` renders in the carrier. Same unhide
  direction as the third breaking family, reached through the ONLY format that can hold several
  views — which is exactly where a multi-view sender ends up. The frame-wrapping predates reader
  views and is unchanged; what was wrong was claiming the family holds without naming where it does not.
- **Fixed: the player's dense frame stamps were undone by the sections inside them.** `data-lp-i` was
  made a dense rank precisely so a recipient could not count the deck — the record says "measured on
  an 8-slide deck carrying two views, the frames read `data-lp-i="0,2,6"` in plaintext, the count and
  the exact withheld slots". The `<section>` inside each frame kept its own `data-authored-slide`, so
  one `grep` on a real carrier read `0 2 3 5` beside frames stamped `0 1 2 3`: the same disclosure,
  one element deeper, in a file the same function had carefully scrubbed of holes. The attribute is
  removed from a REDUCING projection's carrier only — it is not a disclosure when nothing was
  withheld — and nothing downstream reads it: the dense rank and the article mapping are both derived
  before the strip, and `lib/runtime` never mentions it.
