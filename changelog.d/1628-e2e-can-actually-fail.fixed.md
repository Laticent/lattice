- **Fixed: the crash-report browser tests can now actually fail.** Five review
  passes found them proving less than they claimed. The toast checks compared
  against the one bad value each bug had shipped with, so a faithful reproduction
  at slightly different numbers passed all of them — they now assert the value that
  is correct, measure text contrast from the real composited pixels for every line
  of the toast, and check that no line is cut off in either direction. The
  frozen-tab check never stopped anything, because the browser command it used does
  nothing here; it now uses one that genuinely halts the page, and skips with a
  reason if the page turns out to have kept running. And the checks that read a
  toast which disappears after twelve seconds no longer report a healthy app as
  broken on a slow machine, nor a crashed one as healthy — a missing toast is
  excused only when the test watched it take up space on screen first, never when
  it was hidden, collapsed, or absent. A report faded to invisible fails too,
  which it did not before.
