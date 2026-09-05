- **Fixed: two lines of author CSS un-hid every withheld slide, and the export shipped them as blank
  pages.** `<style>section.lens-hole { display: block !important }</style>` on a slide the view keeps
  turned a `brief` export of a 5-slide deck into a FIVE-page PDF, blank at positions 2 and 4 — the
  deck's real length and the exact withheld slots, in the file, from a deck that never names a
  withheld slide. Exit 0, one line under the CLI's own "brief — 3 of 5 slides ship". The engine's
  hiding rule cannot win this and never could: `!important` in author origin outranks an `!important`
  engine rule, and `base.lens-hole.css` had written that attack down in its own header while naming
  the wrong guard for it. `holeDrift` was silent because the class was all still there — it asks
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
  not do is let the count line lie: `section:nth-of-type(2) { display: none }` in front matter
  printed "HTML: 3 slides" over a 2-page PDF.
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
