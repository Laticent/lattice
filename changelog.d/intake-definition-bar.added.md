- **Added: the intake gate now asks whether anyone can actually work a card.** A
  card missing a swimlane or an acceptance check gets `needs:definition` and one
  comment naming what to add, clearing once both are written. The Definition of
  Ready was previously checked only when someone applied `status:ready` — a
  transition nobody performs — so measured across all 318 open cards, 218 had
  never been asked for it, and every one of those 218 is missing the swimlane.
  The work-item form already required both fields; the gap was the paths that
  skip the form. Grandfathered to cards opened on or after the cutoff in
  `.github/scripts/triage.js` (a replay over the real queue flags 7 rather than
  218), and end-user `feedback` reports are exempt — a bug reporter cannot name
  the decision doc their crash belongs to.
- **Fixed: the BACKLOG triage banner read "1 card need triage".** It agreed the
  noun and left the verb plural.
