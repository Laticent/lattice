---
origin: 3148
priority: P3
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-11-11-deferred-asset-bytes.md §7.1
deferred: blocked — needs a measurement on a real laptop with more than four cores; the sandbox has four
---

# Size the export worker pools by the device's cores and memory, measured

why now   — The picture and pdf-image pools are `min(2, cores − 1)`, set to protect phone memory. On a 4-core sandbox a
            third worker cut a print from 84 s to 76 s before the slide overlap landed; a laptop with 8+ cores may gain
            more, a phone must not lose.
where     — docs/src/components/studio/export/picture-encoder-pool.js `poolSize`, pdf-image-pool.js.
done when — the size reads cores and `navigator.deviceMemory`, phones stay at 2, and a print of a 50-slide photo deck is
            measured at 2, 3 and 4 workers on a real laptop.
evidence  — the three print timings and peak memory on that laptop.
verify    — tier 0: self-review with the measurements.
