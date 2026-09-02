- **Fixed: the published CLI can run `--lens`, read-along and chart narration.** `dist/lattice-emulator.js`
  left `require("@workwel/lente")` and three `require("@workwel/cadenza")` calls bare, and those are
  npm-workspace members: they resolve through a symlink in this repo and resolve nowhere after
  `npm install @workwel/lattice`. The CLI bundle now inlines the workspace packages like the rest of
  the local graph, so `--lens`, read-along, chart narration and the caption kernel run outside a
  clone. Verified by running a `--lens` export with those packages made unresolvable.
- **Fixed: a reader-view export checks that a pruned slide still renders the same, and keeps the author's text when it does not.**
  Removing a `<!-- _lens: … -->` tag is a text edit, and a text edit to markdown moves the blocks
  around it. Taking the tag's newline spliced the next line onto whatever preceded it — on a line
  followed by a code fence the fence never opened, its closer became an opener, one authored slide
  rendered as two, and a reader on one view was shown a slide from another. Leaving the newline was
  no better: the residue `- ` is a setext underline, so the paragraph above became a heading, and a
  whitespace-only line inside a tight list turned it loose and gave every item a paragraph wrapper.
  Even a clean deletion of a tag on its own line merges the paragraphs it sat between, turns a
  paragraph above a `===` into a heading, and welds two lists into one. Six rules were written for
  this and all six were wrong, because which edits are safe is a property of the PARSER, not of the
  text. So the export stopped deciding: it RENDERS each slide with the engine's own markdown-it
  before and after, keeps the prune only when the two renders match, and otherwise returns the
  author's bytes untouched. Comparing parse tokens instead was tried and is not enough — a link
  reference definition emits no token at all, so deleting the line above one killed the definition
  and printed its URL on the slide while a token comparison reported no change. The shapes that
  broke each attempt are pinned by hand, with answers derived from markdown-it; a fuzz runs beside
  them for breadth, and does not claim to be an independent oracle — twice it shared the kernel's
  model and certified a corruption instead of finding it.
- **Fixed: a second `_lens` comment on one slide is no longer invisible.** Lente reads only a slide's
  first tag, so a second one was never parsed and never rewritten — dead weight to every reader, and
  a withheld view's id to the recipient of a projected export. `stripExtraLensTags` removes it when
  its line, trimmed, is just the tag; one sharing its line with a container marker or other text is
  left alone, as is any removal the structural check above rejects.
- **Fixed: a `_lens` or `_class` comment an author QUOTED is no longer treated as a directive.** A
  backticked `` `<!-- _lens: ask -->` `` example, or one written mid-sentence, was read as the
  slide's reader-view membership — and a `--lens` export, which rewrites tags to prune views it does
  not carry, then EDITED it, shipping "Write `` at the top" where the author wrote an example. Lente
  now recognizes a directive only when the comment opens its line, which is precisely when
  markdown-it makes an `html_block` of it, so the reader answers the question the way the renderer
  does rather than by a scan of its own. The engine reached the same rule after the identical defect
  (`lib/core/class-directive-scan.mjs`); the two are pinned against each other, and against
  markdown-it, by a differential fuzz over quoting shapes. Where the rule is not CommonMark — a
  container marker carrying four columns of its own indent, a fence opened inside a blockquote — both
  copies say so together, and those shapes are enumerated in the pin and tracked as #2034 rather than
  claimed absent. Fence detection also gained CommonMark's three-space indent cap in the same pass —
  a four-space-indented ``` is an indented code block, not a fence, and reading it as one made a
  following directive vanish.
- **New: an export that cannot withhold a view refuses instead of leaking it.** A tag the prune
  could not remove still names a view the recipient is not getting. The export re-reads what it
  emitted and refuses, naming the id — and it asks the ENGINE'S PARSER which directives a reader
  would actually be shown, not Lente's own fence scan. That distinction is load-bearing: Lente
  opens a fence on ```` ```js` ```` (an info string carrying a backtick) where markdown-it opens
  none, so a check reading through the same scanner as the pruner was blind exactly where the
  pruner was blind, and a withheld id reached a real envelope with `ok: true`. The message names both
  causes and the fix: give the tag a line of its own with a blank line above and below, clear of any
  list.
- **Fixed: a projected export no longer silently loses what the slides around it were carrying.**
  Marp global directives apply from their slide onward and link reference definitions resolve
  document-wide, so dropping a slide changes the ones that remain. A
  `<!-- footer: CONFIDENTIAL - do not distribute -->` set on a slide a view excludes vanished from
  every kept slide — the marking stripped from the very file being sent, while the sender previewed
  it with the marking on (measured: 6 occurrences in the full export, 0 under `--lens`). A `[ref]:`
  definition on a dropped slide turned every reference on kept slides into literal `[text][ref]`. An
  adversarial fuzz put the class at ~4% of projections. The export now renders the deck both ways and
  compares each kept slide against itself, refusing rather than shipping the difference; the message
  names the likely directive and the fix.
- **Fixed: front-matter `captions:` are projected with the slides.** The block is keyed by 1-based
  slide number, and the prune only ever touched `lenses:` — so a withheld slide's caption shipped
  verbatim in the embedded envelope, and with `--captions` was read aloud over whichever slide had
  moved into that position. Entries for withheld slides are dropped and the survivors renumbered.
- **Fixed: `_focusSteps` no longer breaks the reader-view page map.** The rule rebuilds the token
  stream and emitted its slide separators unmarked, so every focus copy counted as a new authored
  slide — and every heading split in the deck lost its mark with them. In a carrier that shifted the
  baked view map: a `brief` reader was shown a slide the view excludes while one of its own members
  was unreachable, on `examples/focus.md`, a deck this repo ships. Each break now carries the flag it
  should, and the export additionally refuses if the rendered deck numbers its slides differently
  from the projection — so the next rule that forgets is caught without being named.
