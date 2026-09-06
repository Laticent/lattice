- **Added: the deck's **Motion** settings now show what the deck will actually animate.** Under
  Play / Style / Speed, the deck Inspector lists every target the engine can reach, what each one
  resolves to, which scope decided it, and whether the motion carries information a still cannot —
  with a one-click fix for the ones that do not, and a jump to the slide.
- **Removed: the Fabricate **Motion** tab.** It authored standalone animated scenes on an engine
  Lattice no longer uses (3-D primitives, a spin period, an easing curve, a poster slider), and its
  output could not be placed in a deck. Your saved scenes are **not** deleted — they stay in your
  library, ride in every backup, and Workspace → Data now offers them as a `.zip`.
- **Fixed: a saved motion scene whose spec no longer validated was silently deleted.** It vanished
  from the Library *and* from the next workspace backup, so restoring onto a clean profile lost it
  for good. Scenes we cannot read are now kept, reported with the reason, carried through the backup
  verbatim, and restored untouched. A shelf that fails to READ is no longer recorded as an empty one.
- **Fixed: an exported asset bundle labelled SVG scenes with the name of a deleted engine.** The
  manifest and README said `vivus`; the painter has been anime.js since the engine bake-off.
- **Fixed: `base.docs.md` promised animated charts a playback control they never had.** The chart
  path passes `chrome: false`, so there is no pause / play / replay corner control, and a
  reduced-motion viewer sees the finished chart still rather than a reduced build.
- **Fixed: restoring a workspace backup could overwrite a working motion scene.** A record the
  backup could not parse was written back without its id, so it replaced whichever scene held the
  same name — and scenes carry no version history to recover from.
