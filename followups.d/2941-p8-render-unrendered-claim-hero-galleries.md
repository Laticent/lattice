---
origin: 2941
priority: P8
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-07-03-claim-content-claims-the-stage.md
source: https://github.com/Laticent/lattice/pull/2951
---

# Look at the claim-hero galleries CI did not render for #2951

```text
  P8 · [no ticket] check the 74 galleries #2951's golden-diff skipped
       why now   — #2951 made `claim-hero` and `claim-bleed` drop the deck's running header. CI's golden-diff
                   renders at most 40 galleries per PR, so 74 that could use claim-hero were never rendered
                   with the change. Read from the golden-diff comment, not looked at.
       where     — galleries and examples using `claim-hero`/`claim-bleed` (grep `_class:.*claim-`); the nightly
                   bless renders the whole corpus.
       done when — every slide using claim-hero or claim-bleed has been looked at after the nightly bless, and
                   none shows a missing header that its author wanted.
       evidence  — the nightly bless's golden diff for those galleries, with any page that moved named.
       verify    — tier 0 gates, because it is a read of rendered output.
```
