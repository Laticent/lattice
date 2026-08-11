- **Added: the Studio now tells you when it crashed, and what it measured.** A tab
  that dies of memory pressure — or that the browser discards in the background —
  takes the whole page with it: no error handler runs, and the reload that follows
  wipes the console. So the Studio writes as it goes instead. A local flight recorder
  keeps a rolling record of what you were doing, how memory was trending, any
  main-thread freezes and the last error it saw, and stamps it closed on a clean
  exit. A record that was never closed is a session that ended unexpectedly, and the
  next time you open the Studio it says so — one toast, then a report of what it
  actually measured. It does not guess at a cause: no browser tells a page why a tab
  died, so the report states what it saw and names a reason only where the browser
  itself stated one. **Report on GitHub** hands you a pre-filled issue under your own
  account; nothing is sent anywhere on its own, and nothing but labels — deck title,
  slide count, deck size — ever enters the record. Reports are reachable afterwards
  from Workspace → General → Crash reports, which is always there — saying so even
  when nothing has crashed, so you can tell "nothing went wrong" from "nothing is
  watching" — and clearable there. Workspace → Privacy & Data's "Delete everything"
  erases them along with the rest, sealing the recorder in every open tab so nothing
  is written back. See `engineering/decisions/2026-08-10-studio-crash-sentinel.md`.
