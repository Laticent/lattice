- **Fixed: the crash-report browser tests can now actually fail.** Two review
  passes found them proving less than they claimed. The toast checks compared
  against the one bad value each bug had shipped with, so a faithful reproduction
  at slightly different numbers passed all of them — they now assert the value that
  is correct, measure text contrast from the real composited pixels for every line
  of the toast, and check that nothing is cut off. The frozen-tab check never froze
  anything, because the browser command it used is a no-op here; it now verifies
  the freeze happened and skips with a reason when it cannot, rather than passing
  silently. And the checks that read a toast which disappears after twelve seconds
  no longer report a healthy app as broken on a slow machine, nor a crashed one as
  healthy.
