- **Breaking:** a `--lens` export now refuses a deck whose rendered page adds or removes slide
  sections after the layout was checked. Three attacks reached disk before this, all measured on the
  real CLI, all at exit 0:
  - **decoy sections.** The withheld set was anchored to the projection but the PROMISE it is checked
    against was still counted off the live DOM. A script appending two empty `<section
    data-lattice-slide>` elements at load inflated that count, then removed them in `beforeprint`
    while un-hiding the holes — so both sides moved together and agreed. Result: `brief — 3 of 5
    slides ship` and a FIVE-page PDF, blank at exactly the withheld positions. A section now counts
    toward the promise only if the render numbered it and that number is one the projection kept, or
    it is one of the appended slides the source says exist.
  - **three unguarded write paths.** `assertArtifactPages` guarded four call sites while the export
    has seven. `--raster` / `--paper` PDF, the `.html` deliverable and the `--player` carrier reached
    disk unchecked: a deck that strips the hole class once print emulation is turned back off
    produced `PDF: … (raster, 6 pages)` directly beneath `3 of 6 slides ship`, and a six-frame player
    carrying all six authored stamps. All three are now held to the promise.
  - **a kept slide taken away.** A script that ADDS the hole class to a slide the view ships was in
    no check's blind spot list — `shown` wants `hole && boxed`, `vanished` wants `!hole && !boxed`,
    and this is `hole && !boxed`. The recipient silently lost an approved slide. Refused now.
- The player decides what a hole is from the projection rather than from the captured DOM, and strips
  `data-authored-slide` whenever the projection reduces — not only past two views, which left the
  ordinary single-view `--lens brief --player` publishing the withheld slots to one `grep`.
- An absent or zero page promise is a refusal under a reader view instead of a silent pass; zero is
  what a broken section selector produces, and it disabled every artifact assertion at once.
