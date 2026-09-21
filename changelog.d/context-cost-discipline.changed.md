- **Changed: the unit suite prints a dot per test instead of a TAP stream.** `npm test`
  emitted 657,806 o200k tokens across 70,428 lines, of which 256 lines carried a
  number or a failure — and because the pass/fail counters land at the *end*, any
  reader with a truncated view lost the one part that said whether the run was green.
  Every `node --test` script now defaults to `--test-reporter=dot` (477 tokens on a
  green run, 1,379x smaller), which still prints the full assertion diff and stack on
  a failure. `npm run test:tap` gives back the TAP stream for anything that parses it.
- **Changed: the SessionStart hook prints setup output only when a step fails.** Its
  npm, build and apt chatter came to 3,763 tokens of every web session's opening
  context and reported nothing a reader acts on when setup worked. Each step now logs
  to a file and prints it only on failure, so a broken setup is *louder* than before
  while a working one costs 29 tokens.
