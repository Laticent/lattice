- **Fixed: the author-script-deferral export suite no longer races a wall clock.** Its
  fixture asserted that a 400 ms author timer had not fired when the export captured, but
  the script-start-to-capture window measures 125-335 ms on an idle machine — 65 ms of
  headroom in the worst of three runs, with 210 ms of spread. Six concurrent renders push
  that window to 450-941 ms and the timer wins 4 times in 6, which is how the suite
  ejected an unrelated 180-golden PR from the merge queue. The fixture's timer is now
  sized against the suite's own 120 s timeout rather than against the measured window, so
  for it to fire the render would have to outlast the test itself: runner load can no
  longer decide the verdict, and a pathological render fails loudly as a timeout instead
  of quietly as a wrong assertion. No engine behavior changed.
