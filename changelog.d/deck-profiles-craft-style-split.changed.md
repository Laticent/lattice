- **Breaking: the deck scorecard reports TWO grades — Craft and Style — instead of one
  overall number.** `scoreDeck()` now returns `{ craft, style, profile, categories }`
  where it previously returned `{ overall, band, categories }`, and the five categories
  became seven split across the two halves (`structure` · `craftProse` · `contract` in
  Craft; `brevity` · `framing` · `data` · `pacing` in Style). The single grade averaged
  three incommensurable things — does it render correctly, did the author do the work,
  and does it match one genre's house style — so a well-made teaching deck with zero lint
  findings and zero craft findings scored C+, the joint lowest of the 197 committed decks.
  Craft is genre-blind and holds the same bar for every deck; Style is measured against a
  named profile and always reported with it.
- **Added: deck profiles — `profile: boardroom | teaching | mission | academic | general`
  in front matter.** A profile carries the contested, genre-relative numbers (slide prose
  budget, heading budget, and whether "no clear ask" and "no agenda" deduct at all); every
  value is set from the measured distribution of the committed corpus rather than picked
  by preference. A profile is a different bar, never a lower one — it cannot relax a craft
  defect or an authoring error. Undeclared decks resolve through component inference, and
  fall back to the lenient `general` profile when inference abstains.
- **Fixed: the density penalty no longer floors a category, and no longer scales with deck
  length.** `wall-of-text` deducted 12 points per slide, uncapped, so nine dense slides
  took 108 points off a 100-point category and any deck long enough could reach zero —
  after which the score stopped discriminating between "slightly over budget everywhere"
  and "genuinely unreadable". Every rule family now deducts a curved rate over the slides
  it could have fired on, bounded by a per-family ceiling.
- **Changed: `density-crowd`, `density-overflow` and the verbose-chrome findings now count
  toward the grade.** They were surfaced to authors and silently ignored by the scorer,
  while `wall-of-text` — which measures nearly the same thing — was scored uncapped.
- **Changed: Pacing is `n/a` unless a talk length is set or the deck runs past 40 slides.**
  It read 100 on 196 of 197 decks while carrying 19% of the grade's weight — ballast that
  lifted every score and graded nothing.
- **Added: the Studio Coach names the profile it judged Style against, says where that came
  from (declared, inferred, overridden, or the default), and lets you change it.** An
  inferred profile is shown as a guess, never applied silently; a misspelled `profile:`
  value is reported rather than swallowed.
