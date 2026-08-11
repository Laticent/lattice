- **Fixed: the crash-report browser tests can now actually fail.** A review found
  three of them proved less than they claimed. The toast checks compared against
  the one bad value each bug had shipped with, so a faithful reproduction at
  slightly different numbers passed all of them; they now assert the value that is
  correct, and measure text contrast from the real composited pixels. The
  frozen-tab check never froze anything — the browser command it used is a no-op
  here — so it now verifies the freeze happened and skips with a reason when it
  cannot, rather than passing silently. And the "no false alarm" check read a toast
  that disappears after twelve seconds, which on a slow machine passed even when a
  crash had been reported; it reads the stored record instead.
