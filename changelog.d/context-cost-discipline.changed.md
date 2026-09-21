- **Changed: the unit suite prints a dot per test instead of a TAP stream.** `npm test`
  emitted 657,806 o200k tokens across 70,428 lines, 70,172 of them TAP bookkeeping — and
  because the pass/fail counters land at the *end*, a reader with a truncated view lost the
  one part that said whether the run was green. The unit scripts now default to
  `--test-reporter=dot`: **1,182 tokens on a green run, 557x smaller**, with the full
  assertion diff, stack and exit 1 intact on a failure (1,371 tokens for the same suite with
  one seeded failure). `npm run test:tap` gives back the TAP stream. `test:watch` and the
  `test:integration*` scripts deliberately keep the default reporter — dot never flushes its
  failure block under `--watch`, and the nightly job summary greps `^not ok` to find a red
  integration run.
- **Changed: the SessionStart hook prints setup output only when a step fails.** Its npm,
  build and apt chatter came to 3,763 tokens of every web session's opening context and
  reported nothing a reader acts on when setup worked. Each step now logs to a file; on
  failure the hook prints that step's own output and names the log. A working setup costs 29
  tokens, and a broken one is *louder* than before, because its error is no longer buried in
  a hundred lines of successful noise.
