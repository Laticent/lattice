- **Changed: exporting a narrated webpage keeps the Studio responsive while it packs the audio.**
  The export used to compress, encode and hash every clip on the main thread, about 0.1 s each,
  so the progress bar froze and Cancel stopped answering on a long deck. That work now runs in a
  small pool of background workers. On a 75-clip export, the main thread's blocked time fell from
  about 4.9 s to 2.4 s. If workers cannot run, the export packs on the main thread as before and
  produces the same file.
- **Changed: cloud voices speak up to six sentences at once, and a busy provider no longer
  fails a narrated export.** Live narration, Present's look-ahead and the export used to run
  three requests each against the same voice, with no shared view of what was already in
  flight. They now share one queue per voice model. The sentence being played goes first,
  then the look-ahead, then the export, and a sentence two callers both need is fetched once.
  When a provider answers "too many requests", the queue waits as long as the provider asks,
  halves how many it sends, then climbs back. A provider that keeps failing pauses for 15 s
  before one test request. Each model starts at the parallel count we measured for it (six
  for most; one for CSM, whose provider serves one request at a time).
- **Added: Workspace › Narration › Parallel requests.** Choose how many sentences a cloud
  voice may speak at once (1 to 8), or leave it on Automatic. The on-device voice always
  speaks one sentence at a time.
