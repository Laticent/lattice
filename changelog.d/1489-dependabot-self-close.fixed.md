- `engineering/gotchas/ci.md` now carries the artifact behind its claim that Dependabot closes a
  superseded pull request by itself. #2002 landed the hand-made `brace-expansion` bump on `main` at
  17:01:23Z on 2026-09-01 and `dependabot[bot]` closed #1489 at 17:50:50Z, 49 minutes later, with
  nobody touching the PR. The bullet had asserted this with no measurement behind it.
