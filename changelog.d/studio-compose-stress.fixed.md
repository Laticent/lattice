- **Fixed: copying and pasting in Compose no longer strips a slide's component.**
  A slide's `_class` rides the slide node's `directives` attribute, and the
  schema's `toDOM`/`parseDOM` pair — which is the clipboard contract, since
  ProseMirror serializes a copied slice through the schema rather than the node
  view — did not carry it. Select the deck, copy, paste, and every slide came
  back as an unstyled `content`: seven boardroom components gone in two
  keystrokes, with nothing on screen to say so. The attribute now bridges through
  a `data-directives` attribute on both the schema and the live node view, so a
  DOM re-read recovers it too.
- **Fixed: a folded slide in Compose stays folded.** Collapse was re-established
  by ProseMirror node identity, which carries it through an in-Compose slide op
  and through nothing else — so the rail's add / duplicate / move / delete and
  the add-slide gallery, which all rewrite the deck source, unfolded every slide
  on the resync that followed. Collapse is now restored across a re-import by
  matching each folded slide's source chunk, so it follows its slide through a
  reorder and survives an insert above it.
- **Fixed: "Insert table" is offered only on a component that takes a table.**
  The control appeared on all 61 components and worked on all 61, writing an
  empty grid into the source of a `title` or a `big-number` — which the engine
  then drops, so the table was visible in the editor and absent from the slide.
  It now reads the same manifest slot/skeleton contract the engine does (four
  components take a table today); an unclassed or unrecognized slide stays
  permissive.
- **Fixed: deleting the slide you are editing lands on its neighbor.** The caret
  had no slide to re-anchor to, so the selection mapped to the end of the
  document and both the caret and the preview jumped to the last slide — walking
  you to the back of the deck each time you cleared a slide.
- **Fixed: inserting a slide from the gallery puts the caret in the new slide.**
  The rail moved and the preview painted it, but the caret stayed behind, so the
  next thing you typed went into the previous slide.
- **Fixed: a locked slide's "edit in Markdown" badge is no longer clipped by the
  delete cap.** The one piece of chrome explaining why the slide will not take a
  keystroke was cut off mid-word.
- **Fixed: pasting a multi-slide clipboard can grow the deck.** Compose's
  structural guard tells a deliberate cross-slide edit from an accidental
  Backspace-merge by reading the selection — the right question for a keystroke
  and the wrong one for a paste, where the author declared intent by putting
  slides on the clipboard. Every multi-slide paste was rejected silently, so
  there was no way to duplicate a section. The guard now exempts a paste or drop,
  after the locked-slide check it still may not bypass.
