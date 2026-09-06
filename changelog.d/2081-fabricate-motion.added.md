- **Added: describe a drawing in words, or bring one you already have.** The Motion tab's front door
  now carries the same command bar as Theme, Component and Finish: say what you want drawn and a
  model draws it, ready to choreograph. It asks for outlined line art in your palette's colors —
  which is exactly what draws itself well — and the result goes through the same reading and
  reporting a pasted drawing does, so you see what was kept and what was removed either way. With no
  model connected the bar says so and offers to connect one; pasting still works untouched. A reply
  that gets cut off mid-drawing says that, rather than sending you back to reword a prompt that was
  fine, and pressing Enter to commit a character in an input method no longer submits half a prompt.
- **Added: Fabricate has a fourth faculty — **Motion**, which crafts a drawing that moves.** Bring an
  SVG (paste it, or drop the file), and it finds the drawing's parts, you give each one a beat, and it
  plays. Name it and **Save** puts it on your Library shelf beside your themes, components and
  finishes; **Insert** writes the slide. The drawing travels inside the deck, so a deck you forward
  carries its own art.
- **Added: an intake receipt, because sanitizing a drawing is not a silent step.** Two of the
  commonest exports come through our security boundary looking perfectly healthy and painting
  nothing — Illustrator's "Style Elements" option puts every fill in a stylesheet we have to remove,
  and an icon sprite draws itself with references we have to expand. The receipt says what was
  rewritten, what was removed and what was kept as-is, and each line names the fix. Reused symbols
  are expanded for you; an embedded image is removed and told you why (it would have fetched from
  someone else's server in every copy of your deck).
- **Added: a frame strip under the preview.** Every frame the motion has, at once, with the last one
  labelled as the still your PDF freezes. It is also the whole surface for anyone whose system asks
  for reduced motion: the preview settles rather than autoplaying, and every beat is still checkable
  as a picture, by keyboard, with nothing moving.
- **Added: “Match the theme”**, which recolors a brought drawing to your palette. It rewrites the
  drawing itself rather than the plan, so the new colors reach fills, outlines *and* the still that
  lands in your PDF and in a shared HTML file.
- **Fixed: placing one drawing on two slides made both stop working properly.** Every insert now
  gives its copy of the drawing its own element names, so a second copy cannot reach back into the
  first — which, in a drawing that uses a clipped or gradient-filled shape, is what makes the second
  one paint wrong. The deck we ship as the worked example carried five such collisions.
- **Fixed: inserting from the Library could add the slide in the wrong place.** The Insert action
  used the slide you were looking at rather than its position in the whole deck, so in any view that
  filters slides it landed after the wrong one.
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
