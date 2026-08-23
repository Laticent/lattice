- **New blocking gate:** `check:route-budget` fails the docs build when the Studio or
  Playground route grows past its recorded byte budget — and *also* when a budget has
  gone stale-loose, so a win cannot be silently re-spent. The ledger lives in
  `docs/route-budget.json`, so payload growth shows up as a reviewable line in the diff
  of the PR that causes it, rather than in a nightly nobody reads.
