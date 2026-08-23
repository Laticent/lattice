- **Added: browser tests for the crash report, so its bugs cannot come back
  quietly.** Every defect this feature shipped was one a unit test could not see —
  a toast whose shape clipped its own text, description text that was invisible in
  light mode, a tab that slept through "Delete everything" and wrote its data back.
  Those were caught by throwaway scripts that would have been deleted with the next
  cleanup. They are now committed specs that run against a real browser every
  night, including WebKit at phone size — the engine the original report came from.
