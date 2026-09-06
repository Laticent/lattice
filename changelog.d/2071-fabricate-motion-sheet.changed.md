- **Changed: the Fabricate **Motion** tab is now the deck's motion sheet.** It used to author a
  standalone animated scene — 3-D primitives, a spin period, an easing curve and a poster slider —
  none of which survives the frame model, and whose output nothing in the product could place. It
  now lists every target in the open deck the engine can animate, what Play / Style / Speed resolve
  to for each, **which scope decided each axis**, and whether the motion carries information a still
  cannot. It writes the same tokens the Inspector writes, as one undo step, and can set an axis on
  several slides at once.
- **Fixed: a saved motion scene whose spec no longer validated was silently deleted.** It vanished
  from the Library *and* from the next workspace backup, so restoring onto a clean profile lost it
  for good. Scenes we cannot read are now kept, reported with the reason, carried through the backup
  verbatim, and restored untouched. A shelf that fails to READ is no longer recorded as an empty one.
- **Fixed: an exported asset bundle labelled SVG scenes with the name of a deleted engine.** The
  manifest and README said `vivus`; the painter has been anime.js since the engine bake-off.
- **Fixed: `base.docs.md` promised animated charts a playback control they never had.** The chart
  path passes `chrome: false`, so there is no pause / play / replay corner control, and a
  reduced-motion viewer sees the finished chart still rather than a reduced build.
