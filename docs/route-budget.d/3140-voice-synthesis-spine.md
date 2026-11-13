studio: +5
The narration export now packs its audio in background workers, and the Studio's startup code carries the reference that
starts them (`narration-pack-pool.js`), plus the Workspace's "Parallel requests" setting. The workers and the voice
scheduler themselves load only when narration runs, so nothing else moves into the startup bundle.
