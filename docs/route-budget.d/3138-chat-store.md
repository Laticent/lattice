studio: +2400
Chat threads moved from localStorage to IndexedDB (#3138), so deck edits stop failing when the shared ~5.2 M-character
space fills: the chat store loads with studio-store (+1593), because the deck list's delete, Clear all, the Privacy &
Data stats and the backup's export and import all reach it synchronously. Given back first: the chat notices, the idle
migration and the localStorage-fill check moved to storage-notices.ts, loaded after boot (2,305 down to 1,770). Making
the store itself lazy means reworking that synchronous backup path, which this PR's data-migration review covers as is.
The merge that keeps every message when an older build's tab and this one both wrote a thread (two code reviews
found data loss without it) adds about 420. Measured 2187 against `main` d505251c (1770 in CI before that merge,
matching the local figure); declared with room for gzip variation.
