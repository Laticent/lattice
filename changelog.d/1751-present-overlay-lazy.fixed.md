- Present no longer loads on the Studio's cold path. `PresentOverlay` and its
  presenter-window, rehearsal, caption/rail and read-aloud-overlay dependencies now load
  on demand behind the first "Present" click instead of statically from `StudioShell`.
  Worth **−23.8KB gz / −57.6KB raw** on the Studio's eager JS (649.5 → 625.7KB gz, 59 → 57
  chunks). The first click shows a brief loading state (Escape or a click dismisses it),
  and every subsequent open reuses the already-loaded module instantly.
