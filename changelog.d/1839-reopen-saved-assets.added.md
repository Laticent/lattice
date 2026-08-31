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
- **Fixed: generating a new component after reopening a saved one overwrote the reopened
  record.** A bare generate replaces the whole draft with a different component, and the
  save is now id-pinned — so with the reopened record's id still held, the new component
  was written over it and every deck naming the old one rendered unstyled. A generate that
  is not a refine now stops editing the opened record. (A hazard the id pin introduced
  rather than one it inherited: before it, the same save merely created a second record.)
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
  its 420px drag ceiling), and the Share label collapses to its icon below `18rem` so the
  four-control row also fits at the 240px minimum. This fixes the theme card too, which had
  clipped the same way since it gained a fourth control.
- **Fixed: saving two components or finishes in one sitting destroyed the first.** The
  faculty pinned the record it had just saved, so naming a second asset renamed the first
  out of existence instead of creating it — and every deck naming the old one rendered
  unstyled. The pin now comes only from reopening a record, which is the one moment the
  author has said which record they mean.
- **Fixed: the ten reserved finish names bypassed the collision guard.** The guard compared
  the preview slug while the store writes a namespaced one (`Ledger` is stored as
  `ledger-custom`), so on those names two live records could land on one slug, and a fresh
  save silently overwrote an existing record instead of refusing. Reopening such a finish
  also renamed its display name to the namespaced slug on the next save.
- **Changed: a component imported without its manifest now says so on the disabled Save.**
  A `.zip` bundle carries no `function`/`form`/`substance`/`description`, so a reopened
  import cannot be saved until those are filled in. The button now names the missing fields
  instead of leaving four red findings to be decoded.
- **Fixed: a saved asset could not be saved twice, or renamed back to a name used earlier
  in the session.** The name-collision guard fired on every save, including ones that
  carry no record id — and those cannot produce the state it guards against, because
  `putAsset` resolves them by name onto the record already holding it. So the plainest
  loop there was (save, keep tuning, save again) died after one save, and the only escape
  discarded the author's unsaved draft. The guard now applies only when a reopened record
  is pinned, which is the one path that can write a duplicate.
- **Fixed: the reason a disabled Save is disabled was unreachable by pointer.** The
  tooltip's trigger was the button, and a disabled button carries `pointer-events: none`,
  so none of the three explanations — name taken, finish name taken, imported without its
  manifest — could ever open. The trigger is now a wrapping span. **Keyboard and screen
  reader still get nothing**: neither the span nor the disabled button is focusable, so
  Radix's focus path stays dead and the description is attached to the span rather than
  the button. That gap is real and is not closed here.
- **Fixed: arming a card's Delete pushed its row out of the card.** The confirm state swaps
  the icon-only button for a wider "Sure?", which overflowed by 21–23px at the docked
  panel's minimum. Below `18rem` the confirm now keeps the idle button's box and drops only
  its word, so the row never reflows and no other control moves.
- **Fixed: making two themes in a row destroyed the first.** The theme faculty pinned the
  record it had just saved, so naming a second theme renamed the first out of existence.
  Pre-existing — it predates this change — but in the same function as the component fix
  and contradicted by that fix's own note.
