- **Fixed: the Playground voice tests (`test/unit/playground`) no longer pass or fail on the machine's speed.** 20
  fixed sleeps and one stopwatch assertion are gone: each test now waits for the request to reach the voice, owns the
  clock the latency record reads, or cancels inside the step it is about instead of racing two timers. Every rewrite
  was shown failing on a broken product line.
