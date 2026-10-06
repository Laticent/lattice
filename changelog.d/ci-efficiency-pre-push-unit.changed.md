- **Changed: the pre-push hook no longer runs the full unit suite.** `npm test`
  took 390s on every push in the cloud sandbox, and CI's `unit` job runs the same
  suite on every PR and again in the merge queue, so it could not stop a
  regression that CI would miss.
- **Changed: CI's `unit` job now runs on every PR, not only PRs that touch code.**
  Unit tests also read prose and config (the US-English audit walks every `.md`),
  so a prose-only PR used to meet them first in the merge queue, where a failure
  ejects the PR. Pre-commit still runs the tests affected by each
  commit. Run `npm test` yourself before calling work done.
