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
  now id-pinned, the finish save takes a history label for the first time (so an edit is
  recoverable from "Earlier versions"), and a rename onto another record's name is refused
  rather than leaving two records sharing one name.
- **Fixed: the docked Library clipped every card's Share and Delete.** The card grid took
  two columns on a `sm:` VIEWPORT breakpoint while the docked panel is a ~270px column, so
  each card was 125px and its action row overflowed its own box by ~110px — the controls
  painted behind the card edge. It now switches on the panel's own width, which is what
  every other responsive control in that panel already did. This also fixes the theme card,
  which had clipped the same way since it gained a fourth control.
