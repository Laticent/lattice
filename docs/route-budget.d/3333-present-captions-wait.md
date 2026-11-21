studio: +18
`useReadAloud` (eager in the Studio island) no longer lets the caption clock wait on a voice that is not ready: muted, the estimate starts at once; unmuted, a read waits up to `PREPARE_WAIT_MS` and then reads the slide on captions. The bounded wait and its fallback are the 18 bytes; without them the highlight froze on word one whenever the selected voice was still loading.
