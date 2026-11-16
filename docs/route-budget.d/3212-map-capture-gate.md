studio: +118

The slide map's poster capture now waits for the reader as well as the rail: one page-wide listener (`keydown`,
`pointerdown`, `wheel`) and a gate in the pool's capture queue (`preview-pool.tsx` `CAPTURE_INPUT_QUIET_MS`). A capture
is one main-thread task that cannot be interrupted, and with the slide's fonts embedded it made a keystroke wait; with
the gate, typing with the map open at 4x CPU measured keystroke p95 144 -> 112 ms and blocking while typing 2,854 ->
1,349 ms (engineering/decisions/2026-11-15-studio-map-load-cost.md). It has to sit in the eager pool chunk, because it
decides whether the lazy capture chunk loads at all. Given back first: the test-only wrapper export went, and the `input`
and `compositionupdate` listeners, which `keydown` already covers. The PR as a whole takes the map's live frames off a
returning reader's load (TBT 4.8 s -> 3.1 s at 4x CPU).
