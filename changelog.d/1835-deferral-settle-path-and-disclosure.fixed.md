- **Fixed: the author-script-deferral suite covers the path a timer that DOES fire takes, and
  says what it stopped covering.** Sizing the fixture's timer against the suite's own timeout
  (#1835) made the verdict independent of runner load, but it also left the probe's
  settle-on-fire path — the one that clears a record once its callback runs — unreachable in a
  real browser, so a regression there would have been a false-positive warning on every deck
  whose timers fire, with every case still green. A fourth slide carries a `setTimeout(…, 0)`
  that lands, and asserts no warning names it. The file's docblock now also states what the
  larger delay costs: it can no longer detect a bounded wait added before capture, a five-second
  grace window passes, and no race-free formulation keeps that check. A harness timeout now
  names its signal and error code instead of surfacing as a bare `null !== 0`.
