- **Fixed: the LTT and Cadenza import gates read seven edge cases correctly** (the last #2347
  checker's list). They now refuse a module load behind a property (`module.require(x)`), `eval`,
  `new Function` and a non-literal `import fs = require(x)`. They no longer flag uses of `require`
  that load nothing (`typeof require`, `require.resolve`, `require.main`). Their comment stripper
  no longer erases code after a `/*` inside a string. `validateLtt` and `validateTrack` keep what
  they found before an unreadable value and never throw, and the LTT schema generator refuses a
  doc comment that documents nothing instead of dropping its tags.
