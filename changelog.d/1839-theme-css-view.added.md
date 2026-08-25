- **The Theme faculty has a CSS view, and the stylesheet you edit IS the theme.**
  Fabricate's token tree now toggles Fields ⇄ CSS, the same shape the Component
  tab's Fields ⇄ manifest-JSON toggle already had. The point is not the editor —
  it is which artifact is the model: the derivation recomputed on a *keystroke*
  (two of its inputs are free-text header fields), so a code editor beside it
  would have been a fork that silently ate your edits. The hand-edited record
  becomes the memo's source instead, and the specimen, the token tree, the WCAG
  audit and Save all read it.
- **A saved theme can be reopened.** `<Fabricate>` took no seed, so a theme could
  be made and never edited again; the Library's theme card gained an Edit action
  that opens the record in the CSS view. Save now pins the record `id`, so
  editing-then-renaming updates the theme instead of creating a second one and
  orphaning every deck that names the old one.
- **Save and Export hand back the author's own bytes.** Re-serializing from the
  token map would have returned a reformatted file with every comment and every
  non-contract token dropped — the exact data loss `lib/theme/parse.js` exists to
  prevent, arriving at the Save button. The one reconciled byte-range is the
  `@theme` directive, which has to match the record's name.
- **Nothing re-derives over a hand edit without saying so.** Going back to Fields
  arms before it discards; the AI bar and its refine chips are disabled while the
  CSS is edited, because `runDescribe` reaches the same destructive place from a
  text box rather than a button. Opening the view and closing it again costs
  nothing — only a real edit is a fork.
- **The theme gate runs live beside the editor**, and a finding on its safety rung
  pauses the CSS out of the preview frame with the reason stated where the
  specimen went blank. A conformance error does not: a theme missing a token is
  wrong and still renders, and hiding it would hide what you are fixing.
- **Leaving over an unsaved hand edit arms first.** A hand-edited stylesheet is the
  one thing in this faculty that cannot be reproduced by clicking around again, so
  the in-app exit does not eat one silently — and typing again disarms it, so a
  mis-click never leaves a red button waiting for the next one.
- **Reopening a SAVED theme arms before it re-derives.** Arming on "has the author
  typed" was wrong for the path this change introduces: a reopened record arrives
  clean, so one click on Fields dropped a stored stylesheet with no confirmation —
  and because Save is id-pinned, the next Save wrote a re-derivation over that exact
  record. Arming is on where the record came from, not on whether it is dirty.
- **The seed is cleared on every exit from Fabricate, not just its own Close.** Left
  standing, the next visit silently opened on someone else's saved theme, still
  id-pinned — so naming it something new renamed and overwrote the original.
- **Save refuses a name another saved theme already holds.** `putAsset` skips its
  name dedupe when an id is given, so a rename onto a taken name wrote two records
  with one name and left the older one listed but unreachable.
