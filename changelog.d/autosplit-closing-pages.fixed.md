- **Fixed: every auto-split run now ends on ONE closing page carrying the below-note and the key
  insight together.** Five carousel strategies still shipped the placement the 2026-09-01 ruling
  replaced — the note spliced into the last body page, the takeaway on a page of its own — so a
  split `compare-prose`, `split-panel`, `decision`, `compare-code` or `list-tabular` slide ended
  with its two closing beats pulled apart. They route through one kernel builder now
  (`closingPageFromMaterial`), so a run reads the same whichever layout it came from.
- **Fixed: `split-panel` no longer loses a trailing key insight and below-note when it splits.**
  Both were dropped outright — no page, no warning. A rendered section ends with three fit-berth
  marker divs, and the reader that finds a layout's own content slot takes the section's last
  element, so it picked an empty berth instead of the panel holding the author's text. Berths are
  chrome now, and a trailing sentence after a structural block is recognized as a note at that
  depth.
- **Fixed: `kanban` and `roadmap` printed a slide's key insight once per lane or card.** Both
  re-emit a slice of the source that carries everything after the last lane, and repeat it on
  every page — a two-lane board printed one takeaway three times. The trailing beats are stripped
  from the slice and close the run instead. `redline` did the same with a below-note.
- **Changed: `compare-prose` no longer builds its own "The verdict" page**, and `list-tabular` no
  longer promotes a trailing below-note onto its cover. Both consumed the note, which is what
  split it away from the key insight; it closes the run beside it now. The unused
  `compare-split-verdict` styling is removed with it.
- **Fixed: a `redline` slide with no why-list no longer has both its passages moved off their
  pages.** The split kernel classified trailing material by element shape alone, so it read
  `redline`'s two quoted passages as universal beats and swept them onto the run's closing page,
  leaving two body pages carrying only a heading. It asks the layout's `coda.claims` now — but only
  where the claimed element rides a MEMBER, which is `redline` alone. A strategy that re-emits
  source repeats everything outside its member set on every page, so a claimed beat left there is
  duplicated rather than preserved.
- **Removed: the `insight` split role, its two page builders, and the four `.lat-split-insight`
  selectors that shipped with no emitter.** A key insight closes the run beside the note now, so
  nothing built or styled a page for it alone.
- **Fixed: a split run of `compare-prose`, `split-panel`, `decision` or `list-tabular` now names
  the page it points at.** Every body page read "→ continues" because the member's title lives in
  a labelled span the pointer's label reader did not know, so it fell through to a path that
  declined on length.
- **Added: a `journey` splits by STAGE on a tall deck** — one stage per page, carrying its own
  band label, its own task rows with their actor dots and mood faces, and both legends, because a
  page of mood faces without the mood key is unreadable. Portrait only: at landscape a journey is
  one figure over a shared axis (every task holds an absolute grid column), so a slice would draw
  tasks into columns that are no longer there — the splitter declines there and the slide rings,
  unchanged.
- **Fixed: a slide's own `_footer:` no longer disappears from every page when the slide splits.**
  The strip that removes the deck's repeated header and footer from a split run identified them by
  the section's `data-footer` — which Marp also fills from a per-slide override, so it could not
  tell the deck's band from this slide's caption and deleted the caption, which then appeared
  nowhere at all. It reads the deck's front matter now. This was live: all three journey slides of
  `portrait-journey` and both roadmap slides of `portrait-roadmap` lost their captions.
- **Fixed: a split `roadmap` pointed at the wrong thing, and a split `kanban` pointed at nothing.**
  The forward pointer resolves a page's members as the first list on it — right where the page's
  body IS that list, wrong where the page holds one sliced card with lists of its own. A roadmap
  phase page named a workstream row instead of the phase ("next: Signal Intake Scoring v2" on a
  page titled "Q2", two fields of one row run together), and a kanban lane page found no list at
  all, so those runs carried no pointer. The splitter now names the member it cut, because it is
  the only thing that knows; runs read "next: Q2" and "next: In progress".
- **Fixed: the CSS selector gate skipped the selectors most likely to be invalid.** It handed
  Chromium every rule prelude css-tree could parse, and silently dropped the ones it could not —
  which is the class most likely to be broken. The stated reason (keyframe percentages) never
  applied: those parse as ordinary selector lists. A keyframe step is now excluded by being inside
  a keyframes block, which is the real reason to skip it, and everything else reaches the browser.
- **Changed: the furniture on a split page is redesigned for a slide read small.** Owner review of
  real social-size renders. The forward pointer leaves the full-bleed ruled band it was wearing and
  becomes a marker in the bottom-right margin, with its rule dropped. The runhead that names the
  source slide loses the wide-tracked uppercase treatment it was wearing — it is fed a slide TITLE,
  and 0.2em capitals turned a forty-character title into a two-line wall; it is a normal-case
  standfirst in the body face now, and every runhead in `examples/read-across-carousel.md` fits on
  one line. The k-of-N rail's off state was a ghost at 0.22 opacity — 1.4:1 against its backdrop,
  reading as a broken hairline rather than as progress — and goes to 0.55, which measures 3.14:1
  and clears the 3:1 WCAG 1.4.11 floor a meaningful graphical object owes. The page's own caption
  takes the pointer's ink lift, and nothing else — a wider caption is what put CONTENT CLIPPED on
  six pages once already. Seven scoped copies of the runhead's finish now read one register.
- **Fixed: a split page's forward pointer stranded its arrow at the far left of the page whenever
  the text wrapped.** The mark was a flex sibling of the text; a text item wider than its row
  shrinks to exactly the space left over, so there is no free space for `justify-content: flex-end`
  to distribute and the mark stays at the row's left edge while the text is pushed right — 390px
  apart on a 972px row. The pointer shrink-wraps to its content now, so there is no free space
  left in the row to strand the mark across, and the mark rides the trailing edge of the box.
- **Fixed: a split `journey` stage sat high on its page with both legends stranded near the floor.**
  Three parts each took their own share of the height instead of composing: the board fills the
  cell, the stack fills the board, and the stage's rows fill the stack, so the cell's own centering
  had nothing left to center. On a split page all three stop growing and the board centers the
  stage and its legends as one group. The unsplit render is byte-identical.
- **Changed: the forward pointer is a pill.** Owner's call, on the redesigned furniture: a subtle
  on-brand pill with the drawn arrow and the label inside it, rather than bare text on the canvas.
  It reuses the universal `--pill-*` register — same radius, padding, weight and tracking as every
  other pill in the engine — and names the one axis it overrides at its own site: `--bg-alt` for
  the fill, because a signal on the page's own canvas needs to separate from it. The numbers back
  the shape: across the nine shipped decks that split there are 153 signals, median label thirteen
  characters, 71% at or under twenty, and not one of them lands on a split cover — so the pill
  never has to survive the inverse surface. `align-self: flex-end` shrink-wraps it, right-anchors
  it without a margin, and is what makes a flex row safe here: the arrow was stranded before
  because the box was full-width, and a box sized to its content has no free space to strand it
  across.
- **Fixed: the run's CLOSING pointer was built by a second producer, and drifted the moment the
  first one changed.** `closingSignal` in `auto-split.js` hand-assembled the same
  `.lat-split-rel` div that `relationship.js` builds (HARD RULE #1). The two agreed for as long as
  the element was a bare div: when the label needed wrapping in a span so the pill could ellipsise
  — `text-overflow` never applies to a flex container — the kernel grew one and the copy did not,
  so a closing pointer rendered unwrapped. Both go through the one builder now.
- **Changed: the forward pointer drops the word "next" and puts its arrow after the label.** Owner's
  call: the arrow already says it. A sequence or cycle page now reads `Trial →` rather than
  `→ next: Trial`, which is six characters of chrome removed from every one of them. The mark moved
  to the trailing edge for every kind that draws one, not just `next` — a `↻` still on the left
  while a `→` sat on the right would read as two widgets rather than one system. The WORDS stay on
  the other two kinds, and the difference is the point: an arrow carries "next", but `↓` and `↑`
  distinguish a hierarchy's two directions without naming them, so `governs` and `under` are still
  doing work. `comparison` draws no mark at all and is untouched.
- **Fixed: four hand-rolled copies of the same tag strip, three of them flagged by CodeQL.**
  `replace(/<[^>]*>/g, '')` had been written out separately in two test files and in
  `withMemberLabel`, and code scanning raised three high-severity alerts for incomplete
  multi-character sanitization on the test copies. All four call the kernel's `textOf` now, which
  strips to a fixpoint. The loop is the gate's accepted remediation rather than a fix for a
  demonstrated bypass — replacing it with a single pass leaves every test green, because
  `<[^>]*>` consumes from a `<` to the next `>` and a surviving `>` has no `<` left to pair with.
  Both the kernel comment and the new property test say so, and the property they pin — nothing
  `textOf` returns carries a tag — holds whatever the implementation.
- **Fixed: a run's closing page read as a page whose content failed to render.** Found by an
  independent visual sweep, and the measurement is the whole story: the coda cell was
  `flex: 1 1 auto`, so on a 1350px page it took 1110px and centered its hundred pixels of note
  inside that, stranding the runhead a thousand pixels above with two hairlines framing the void
  between them. The coda stops growing now, so the section's own centering composes the runhead
  and the closing note as ONE group — the same correction the split `journey` needed, and for the
  same reason: a child that absorbs the free height leaves the parent's centering nothing to
  center. The runhead also drops its rule here, because the note already draws one and the two
  became a doubled hairline 58px apart once the gap closed.
- **Fixed: five defects an independent check found in the redesigned furniture.** All measured on
  real renders, none caught by a gate.
  - The runhead register was declared on `:root` alone, so `var(--text-secondary)` was substituted
    at `<html>` against the theme's SCREEN value and inherited down already resolved — out of reach
    of `section.print`'s remap. A `class: print` split page painted its runhead the theme's blue
    (#455C7A) on an otherwise all-gray paper page. The register is on `:root, section` now, which
    is what the typography generator has emitted for the same reason since #1375. Dark mode was
    never affected: `light-dark()` inside a custom property resolves at the using element.
  - The pointer had `max-width: 100%` under the initial `content-box`, so its padding and border
    landed OUTSIDE that cap — and because the pill is right-anchored, the excess went left, off the
    content column and past the page edge. A split `verdict-grid` rendered a 1019px pill in a 972px
    column with its rounded cap and first character off-page. `comparison` is the reachable case
    because it is the one relationship whose label has no length budget. `scrollWidth` could never
    have caught it: leftward overflow is invisible to it in LTR.
  - **Breaking-ish for anyone reading the ink:** the pointer's ink is `--text-body`, not
    `--text-secondary`. Swept across all 32 shipped palettes in both schemes, `--text-secondary` on
    `--bg-alt` is WORSE than the `--text-muted`-on-`--bg` it replaced in 14 of 28 measurable pairs,
    and bottoms out at 4.63:1 — under the 5.13:1 this redesign names as the problem. On `cuoio`,
    the default theme, it went 5.07 to 4.64. A "read it small in a feed" change cannot dim the
    pointer on the default palette. `--text-body` floors at 5.46:1 and beats the old value in 27 of
    the 28. The pointer stays subordinate by SIZE and placement, which is what was doing that job.
  - The split caption's ink lift never landed. It was written as
    `var(--marp-slide-footer-color, var(--text-secondary))`, but that token is declared
    unconditionally at `:root` and again in every theme that tunes it, so the fallback could never
    fire and the caption kept computing `--text-muted`. It sets `color` directly now — and matches
    the `premise` page's footer, which sits as a direct child of the section and which both of the
    original selectors missed.
  - `test/unit/css/split-signal-scope.test.js` passed on a pill stranded at the far LEFT, which is
    the exact failure it was rewritten to catch: `align-self`'s computed value is the specified
    keyword whatever the parent does, and `width < stageWidth` is true of any shrink-wrapped box at
    either edge. It measures the box's own edges now, and gains a long-label case covering the
    ellipsis and the box model. All three assertions were mutation-checked against the defects they
    name.
- **Changed: one dead rule block and one specificity tie removed from the split furniture.** The
  pointer's pre-pill declarations survived the pill as a second, contradictory 30-line explanation
  of the same element; a full computed-style diff with them removed changed three properties and no
  geometry at all. And the split `journey`'s `justify-content: center` tied on specificity with the
  vertical board's own `flex-start` ninety lines above it in the same file, winning on source order
  alone — it carries the board's `[data-orient]` now, so it is a real override.
- **Fixed: a split `journey`'s mood key named a color encoding the page does not use.** The five
  swatches are the categorical `--journey-mood-*` ramp, which is right on the LANDSCAPE board,
  where every face is painted from that same ramp. The vertical board encodes mood twice and
  neither way is that ramp: the row is washed off the semantic state hues and the face is plotted
  by POSITION on a numbered track in the inherited body ink. Measured on `portrait-journey.pdf`
  p6, the rows render green, every face is navy, and the key beside them shows brown, blue, blue,
  purple and red — five colors that appear nowhere on the page, on a legend this branch repeats
  once per stage. The vertical variant drops the swatches and keeps the scale's verbal anchors
  and numerals, which is what the mood track's five gridlines are numbered by.
