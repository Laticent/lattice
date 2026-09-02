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
  leaving two body pages carrying only a heading. It asks the layout's `coda.claims` now — on the
  strategies that re-emit the section's own markup, where a claimed element survives being left
  alone.
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
