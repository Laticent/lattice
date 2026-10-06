- **Changed: the pre-push hook no longer runs the full unit suite.** `npm test`
  took 390s on every push in the cloud sandbox, and CI's `unit` job already runs
  the same suite on every PR and again in the merge queue, so it could not stop a
  regression that CI would miss. Pre-commit still runs the tests affected by each
  commit. Run `npm test` yourself before calling work done.
