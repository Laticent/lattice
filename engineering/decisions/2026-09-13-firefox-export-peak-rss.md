---
status: in-progress
summary: >
  Firefox's peak RSS on an 18-page Studio export rose 257 MB when #2169 replaced the
  PDF encode, and nobody knew why. It is not an allocation — it is the SPEED. Removing
  the encode's allocations entirely does not lower the number; adding 1.2 s of idle per
  slide, with every allocation unchanged, drops it 519 MB. Firefox's peak is a function
  of how long the export takes, because the same garbage now arrives in a tenth of the
  wall time and the GC gets a tenth of the chance to reclaim between slides. The 257 MB
  is the price of a 9.7x speed-up, not a leak.
---

# Firefox's +257 MB is the speed-up, not an allocation

## The question

`2026-09-13-pdf-export-encode-lanes.md` records, for an 18-page export, peak browser
RSS going 958 → 960 MB in Chromium, 1724 → 1593 MB in WebKit, and **1854 → 2111 MB in
Firefox**. One engine out of three moved, and in the wrong direction, on a change whose
whole point was to stop allocating: the old lane inflated a PNG and re-deflated it in
JavaScript; the new one reads the pixels once and hands them to `CompressionStream`.

## The obvious hypotheses, and what killed them

Three candidates, each an allocation the new encode makes per slide: `getImageData`
(~14.7 MB at 2x HD), `packPredictorRows` (~11 MB), and whatever `CompressionStream`
buffers. Each was removed in turn from `pdf-export-worker.js`'s `encode()`, rebuilt, and
driven through the real export (`tools/bench-pdf-export.mjs --engine firefox --slides 20`,
Firefox 142, same machine):

| Encode does | wall | peak RSS |
|---|---:|---:|
| everything (baseline) | 6.5 s | 2,251 MB |
| no predictor pack — deflate the raw RGBA | 6.5 s | 2,256 MB |
| pack, but no deflate | 7.6 s | 2,515 MB |
| **nothing at all** — no `getImageData`, no pack, no deflate | 6.5 s | **2,412 MB** |

Removing every allocation the hypotheses named made the number **go up**. Whatever sets
Firefox's high-water mark here, it is not the encode's working set.

## What it actually is

The one variable none of those ablations changed is how LONG the export takes. So change
only that: keep every allocation exactly as it ships and add 1.2 s of idle per slide.

| Build | wall | peak RSS |
|---|---:|---:|
| shipped | 6.0 s | **2,436 MB** |
| shipped + 1.2 s idle per slide | 27.1 s | **1,917 MB** |

Same bytes, same buffers, same code path — **519 MB less peak, bought with nothing but
time**. And 1,917 MB is within noise of the 1,854 MB the OLD pipeline recorded, whose
export took 56.1 s.

So: Firefox's peak RSS on this pipeline tracks the export's DURATION, not its
allocations. Every slide produces the same garbage either way; a 9.7x faster export
delivers it in a tenth of the wall time, and Firefox's GC gets a tenth of the
opportunity to reclaim between slides. The high-water mark rises because collection
falls behind production, not because production grew.

That also explains why the other two engines did not move. Chromium and WebKit reclaim
this class of garbage promptly enough that a tenfold compression of the schedule does
not outrun them; Firefox's does not.

## What follows from it

- **Nothing to fix in the encode.** There is no leak and no extra buffer; the pipeline is
  already the bounded-window shape (`PDF_WORKER_MAX_IN_FLIGHT = 2`) that keeps the
  UNCOMPRESSED bitmaps from piling up. The remaining peak is transient garbage awaiting a
  collector.
- **A memory ceiling is bought with time, if it is ever needed.** The 1.2 s experiment is
  a crude version of the real lever: pacing the producer would trade wall time for peak.
  Nothing today asks for that trade — Firefox on a desktop absorbs it — and it should not
  be taken speculatively, because it would give back the speed-up on every machine to
  protect the one that might need it. A device that actually OOMs is the evidence that
  would justify it, and there is none.
- **Peak RSS is the wrong instrument for judging an allocation change.** Read as
  "the new code allocates more", this number was simply wrong, and it took four builds to
  say so. What it measures is the race between an allocator and a collector, so it moves
  with speed, with GC timing and with how warm the browser is. The next question about
  memory on this path should be asked with `performance.measureUserAgentSpecificMemory()`
  or Firefox's own `about:memory`, not with `ps`.

## What this is NOT

- **Not a measurement of the pre-#2169 pipeline.** The 1,854 MB "before" is quoted from
  the earlier note; reproducing it would mean building that tree. What is demonstrated
  here is the MECHANISM — duration moves the number by 519 MB with allocations held
  fixed — which is enough to retire the question without re-running history.
- **Not a claim that the number is stable.** Across this session's runs the shipped build
  measured between 2,242 and 2,436 MB (~8%), and the very first run of a freshly
  downloaded Firefox came in at 2,071 MB. Anything under ~200 MB on this instrument is
  noise. The 519 MB drop is five times that band; the original 257 MB is barely more than
  one.
- **Not verified on a memory-constrained device.** Desktop Firefox in this sandbox only
  (HARD RULE #23). A phone is where this would matter, and a phone is exactly what cannot
  be reached from here.
