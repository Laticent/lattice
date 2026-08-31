- The e2e suite's 21 inherited fixed `waitForTimeout` sleeps are all dispositioned: six are
  replaced with the signal they were standing in for (an overflow-marker attribute, the
  filtered grid's height, the Present dialog, the exported page's boot stamp, and a shared
  `markersSettled` helper that waits for webfonts and then for the marker set to stop
  moving), and fifteen are kept with a written reason — absence assertions, poll intervals,
  measurement windows, and quiescence before a perf counter is zeroed. No behavior change
  for deck authors; this is nightly-suite reliability and wall clock.
