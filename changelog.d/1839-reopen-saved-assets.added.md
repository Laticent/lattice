- **Added: a saved component or finish can be reopened and edited.** The Library card for
  each now carries an Edit control beside Apply/Insert, in the same slot the theme card has
  had since #1850, and it reopens the record in its own Fabricate faculty with the draft
  restored — manifest, skeleton and CSS for a component, the layer recipe for a finish.
  Before this, either kind could be made once and never edited again, though the record
  already held everything an editor needs. Motion scenes stay out until #1678 gives them a
  Library card.
- **Fixed: editing a saved component or finish and renaming it forked the record.** Both
  saves resolved by `(kind, name)` because neither passed the record's `id` — so a rename
  wrote a SECOND asset and left every deck naming the old one pointing at the untouched
  original. The component save made this hard to spot: it already passed
  `historyLabel: 'Before edit'`, so it read as an edit while behaving as a create. Both are
  now id-pinned, and the finish save takes a history label for the first time, so an edit is
  recoverable from "Earlier versions".
- **Changed: saving a component or finish onto a name another saved one already uses is
  refused.** Each faculty now checks its own kind the way the theme faculty always has, and
  Save is disabled with the reason on the button. Two records under one name is not
  cosmetic: the shell resolves an asset by name and the deck preview concatenates both
  stylesheets, so the Inspector shows one and the slide renders the other. This applies to
  a first save too, not only an edit — previously a fresh component save under an existing
  name silently overwrote that record.
- **Fixed: reopening a finish could silently rename its slug.** The name field holds the
  display label and the slug is derived from it, so a record whose label does not slugify
  back to its stored name — `Corporate Blue v2` stored as `corporate-blue`, which the zip
  import can produce — was saved back as `corporate-blue-v2`, and every deck saying
  `finish: finish-corporate-blue` stopped resolving. The field is now seeded with the label
  only when it round-trips, and with the stored slug when it does not.
- **Fixed: the docked Library clipped every card's Share and Delete.** The card grid took
  two columns on a `sm:` VIEWPORT breakpoint while the docked panel is a 240–420px column,
  so each card was 125px and its action row overflowed its own box by ~110px — the controls
  painted behind the card edge. That panel is now always one column (two cards cannot fit
  its 420px drag ceiling), and the Share label collapses to its icon below `20rem` so the
  four-control row also fits at the 240px minimum. This fixes the theme card too, which had
  clipped the same way since it gained a fourth control.
