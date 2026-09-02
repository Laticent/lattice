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
