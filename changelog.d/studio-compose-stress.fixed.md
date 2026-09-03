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
- **Fixed: an inserted table is one you can see.** The starter table was built
  with empty cells, which serializes to `|  |  |` and renders as two hairlines —
  invisible on a dark slide, and indistinguishable from a button that did
  nothing. Its header cells now carry `Column`. The control stays available on
  every component: the engine's universal table treatment renders a plain table
  at the boardroom bar on all but one of them, so there is nothing to withhold.
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
  there was no way to duplicate a section. The guard now exempts a paste — and
  only a paste — after the locked-slide check it still may not bypass.
- **Fixed: a slide pasted from an external page cannot inject directives into
  the deck source.** Slide directives ride the clipboard so a copied slide keeps
  its component, and `parseDOM` matches `section.cs-slide` in any pasted HTML —
  so a crafted page could put a `_backgroundImage` beacon, or a newline-forged
  slide boundary carrying a `<style>` block, straight into the deck source and
  the exported file, with nothing visible in the editor. Pasted directives are
  now believed only when they carry this session's provenance token and are
  shaped like a single-line directive comment.
- **Fixed: restoring a fold no longer snaps the preview to the first slide.** The
  transaction that re-applies folds after a re-import carries a fresh selection,
  which the editor reported as a cursor move — so the preview jumped to whatever
  slide that selection landed on, every time the rail added, moved or deleted a
  slide. The restore is now excluded from the cursor-crossing signal: it changes
  what is folded, not where you are.
- **Fixed: folding a slide next to an already-folded one no longer unfolds the
  neighbor.** The toggle matched any decoration overlapping the slide's start
  position, and a slide's fold decoration ends exactly where the next one
  begins — so folding two adjacent slides in turn unfolded the first and left
  the second open.
- **Fixed: the locked-slide badge no longer collides with the delete confirm.**
  Clearing the resting trash cap was not enough — arming the delete expands the
  group to "Delete? ✓ ✗" and re-clipped the label. The badge now stands down
  while a delete is pending, which is the one moment "edit in Markdown" is not
  the advice that matters.
