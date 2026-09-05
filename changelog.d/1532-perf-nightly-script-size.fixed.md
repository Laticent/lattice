- **Fixed: the nightly perf watch no longer files regressions on bytes that never
  changed.** Its `script-size` metric was classified deterministic and given a 3%
  tolerance on that basis, but it summed Lighthouse *network* records — so it measured
  what happened to load during a visit, not what the build produced. Across 140
  (commit, URL, form-factor) triples read two or more times on an **identical** commit,
  35% moved further than that 3% tolerance and the worst moved **104KB on a ~200KB
  page**, through a median of three runs. 30% of rows re-measured on an identical commit
  pair returned a different pass/fail verdict on different nights. A band wide enough to
  swallow that noise is 52%, which would pass a doubling of the payload, so the metric is
  deleted rather than widened.
- **Fixed: payload growth on `/`, `/components/` and `/getting-started/` is now caught in
  the PR that causes it.** `docs/route-budget.json` covers all five routes the nightly
  measures, not two — deterministic bytes read off the built artifact, blocking, with the
  attribution a nightly never had. `/components/` ships a 448KB HTML document that
  nothing watched before. **This replaces the deleted metric for *deterministic* bytes
  only:** the ledger counts `/_astro/*.js` referenced in the HTML and deliberately does
  not follow dynamic `import()`, so deferred chunks are watched by nothing today — the
  retired metric counted them, unusably. Said plainly rather than as "loses no coverage",
  which is what an earlier draft of this entry claimed.
- **Fixed: a measured regression can no longer go unfiled, across the whole nightly alarm
  family.** A filing step whose `if:` carries no status function gets an implicit
  `success()` from GitHub, so it is skipped whenever any earlier step in the job failed —
  after the verdict is already recorded. Four instances had been fixed by hand; a new arm
  in the nightly-alarm contract test pins the rule and immediately found **three more**,
  in `integration-nightly`, `modulepreload-coverage-nightly` and `preview-e2e-nightly`.
  All are fixed and the eighth cannot land silently.
- **Fixed: a harness failure in the perf watch is no longer filed as a performance
  regression.** Its compare step collapsed every non-zero exit into `regressed=true`, so a
  bad argument or an unreadable report filed a `priority:high` issue whose entire body was
  a run link. It now follows its sibling's exit-code discipline: 1 is a regression, 2 is a
  wiring bug that goes red loudly and files nothing.
- **Fixed: the nightly no longer profiles two deleted pages.** `/drawing-board/` and
  `/workbench/` left both Lighthouse url lists — both surfaces were removed when the
  Studio succeeded them, and their routes are now 310- and 306-byte redirect stubs with
  zero JavaScript, so 12 Lighthouse runs a night measured nothing that could regress.
