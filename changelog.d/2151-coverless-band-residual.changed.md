- **Known limit, recorded rather than hidden:** a coverless `split-panel` split page places its
  forward pointer as an opaque pill in the bottom band, and a long enough member still prints
  under it. The band reservation repositions content that FITS — which is what keeps a run's
  pages aligned and puts the reserve on the right column under `mirror` — but it cannot hold
  longer content out, because the panel clips at its padding box. Measured on a four-member
  portrait deck swept at seven body lengths: 8 and 12 words clear, 16 words collides without the
  reserve and clears with it, and 20 words and up print the pill's full height over the text with
  the reserve and without it, identically. **The engine does not flag these pages**, and an earlier
  draft of this note said it did: at 20 and 24 words the panel's content still FITS
  (`scrollHeight === clientHeight`, nothing clipped), so no `overflow` class is set and no warning
  is printed. What does see them is the deck linter — `lint:deck` calls `density-overflow` against
  this component's ~16-word target, advisory and never blocking, at every length that collides.
  The root fix is in `dockInFooterCell`, which appends both wayfinding marks at section level on
  any page with no footer row, and belongs in its own change.
