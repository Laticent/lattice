- **Fixed: a save and its version snapshot now commit together or not at all.** They
  ran as three separate IndexedDB transactions, so two browser tabs saving the same
  asset could interleave — each snapshotting the same earlier version, each writing —
  and the middle save landed in neither the library nor its history. It is one
  transaction across both stores now, which also means a snapshot that fails rolls the
  overwrite back rather than leaving the record replaced with no way back.
