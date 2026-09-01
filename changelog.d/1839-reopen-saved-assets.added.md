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
- **Fixed: every finish named in a non-Latin script saved as the same record.** The Finish
  faculty derives two slugs — one for the preview class, which falls back to `custom` when
  nothing survives slugification, and one for the saved identity, which is empty in that
  case. Save was gated on the first while the collision guard compared the second, so
  `报告`, `Отчёт` and `تقرير` all passed the gate, matched nothing in the guard, and stored
  as `custom`: three finishes became one record, each save silently replacing the last
  under a "Saved" toast. Both sides now read the name the store actually writes, so such a
  name is refused at the gate instead of quietly renamed. Reserved names (`Ledger` →
  `ledger-custom`) still save normally. The theme and component tabs never had this hole —
  their name pattern rejects those names outright.
- **Fixed: a fresh save under an existing asset's name silently replaced it.** Scoping the
  name guard to reopened records fixed a deadlock and opened this: with nothing pinned the
  store resolves `(kind, name)` and updates whoever holds the name, so typing a name another
  saved theme already used overwrote that theme with the current draft — a record the author
  had never opened. Two requirements were being served by one flag, and no version of that
  flag can hold both: refuse every clash and a second save of your own asset deadlocks;
  refuse none while composing and this happens. The guard now asks whether the session
  OWNS the record holding the name — by having reopened it, or by having written it here —
  which it tracks as a set, because renaming back to a name used earlier in the same
  session is legitimate and a single "last saved" id cannot express that.
- **Fixed: saving a theme, then editing it and saving again, was impossible.** Scoping the
  name-collision guard to reopened records fixed the component and finish faculties and
  missed the theme one, which then paired with the matching change to the theme's id pin:
  a fresh save left nothing pinned while the record it had just written now held the name,
  so Save was disabled — permanently, for that theme — with a tooltip naming the record the
  author had just created. The only escapes were a rename, which forked a second record,
  or leaving the faculty, which discarded the unsaved edit. The rule now lives in one
  function all three faculties call (`library/save-guard.ts`) rather than three copies of a
  two-part rule, and it has its own state table.
- **Changed: an id-pinned save no longer reads the whole asset shelf.** The uniqueness
  check queried every record to find same-kind ones, so a shelf holding reference-doc PDFs
  paid for deserializing all of them on a path that used to read a single record by key —
  measured at ~50–100ms and ~24MB per save with three 8MB documents on the shelf, against
  ~0.3–13ms before. It now reads the `kind` index, which is both cheaper (~0.7–13ms) and
  the precise question, since the invariant is per-kind.
- **Fixed: two saved assets could end up sharing one name.** The three faculties each
  refuse a name another record holds, but they read a snapshot refreshed on save — so a
  second tab, or a workspace restore behind an open faculty, made the check blind and the
  id-pinned write went through. Two live records under one name is not cosmetic: the shell
  resolves an asset by name and takes the newest while the preview concatenates every
  match, so the Inspector shows one and the slide renders another, and neither record can
  reach its own version history afterwards. `putAsset` now enforces `(kind, name)`
  uniqueness inside the write transaction and aborts, so a refused save leaves the shelf
  byte-identical — and the faculties report the store's reason instead of a generic
  storage failure.
