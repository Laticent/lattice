- **Fixed: the export integration tests (`test/integration/export`) no longer pass or fail on the machine's speed.**
  55 places in 24 files slept a fixed time before checking a real browser or a listener. Each now waits on the
  signal the check reads: the player's own state, the page's timer queue going empty, a beacon request that proves
  every earlier load was seen, or a listener drained of every connection a finished client opened. The security
  tests that assert nothing reached the network now run the same attempts against an unwalled witness right after the walled
  run, so their zero is proven, not assumed. Every rewrite was shown failing on a broken product line.
