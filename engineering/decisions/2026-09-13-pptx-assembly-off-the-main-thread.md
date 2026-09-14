---
status: in-progress
summary: >
  The PowerPoint export froze the tab for 717 ms at the end of a 56-slide build. The
  obvious culprit — the per-slide PNG encode — turned out not to be one: measured, the
  per-slide stall is the same in PowerPoint and in the PDF, whose encode already runs
  in a worker. What was left was the TAIL: pptxgenjs writing an XML part per slide,
  JSZip base64-decoding every image, and the zip write. So the whole document build
  moved, not the encode. Longest frame gap 717 ms → 383 ms, total blocked 10,769 ms →
  8,445 ms, which is the PDF's own floor. The .pptx is byte-identical but for its
  creation timestamp.
---

# The PowerPoint build leaves the main thread — the document, not the encode

## The question, and the answer that was wrong

`2026-09-13-pdf-export-encode-lanes.md` closes with the PPTX and image-set exports
named as *"not the whole browser export surface … still run entirely on the main
thread"*. The obvious read is that PowerPoint has the same defect the PDF had —
`html-to-image`'s `toPng` is `toCanvas(…)` followed by a SYNCHRONOUS
`canvas.toDataURL()`, and the PDF lane measured its PNG work at 824 ms a slide.

That reasoning conflates two different operations, and measuring separated them.
jsPDF's 824 ms was a JavaScript-level inflate + re-deflate of an existing PNG.
`canvas.toDataURL` is the browser's own encoder, and it is fast.

## The measurement

`tools/bench-pdf-export.mjs` grew an `--artifact pptx` arm and a frame-gap meter.
Wall time cannot say whether a tab froze — an export can be quick and still stop
painting for a second at a time — so the meter records every animation-frame
timestamp and reports the longest gap, the total time the tab could not paint, and
how many separate stalls that was. One 800 ms freeze and twenty 200 ms ones are
different defects with different fixes.

The first 58 `---` blocks of `examples/gallery-jargon.md` = 56 slides, Chromium 141,
built docs site, same machine, quiet:

| Export | wall | longest gap | blocked | stalls |
|---|---:|---:|---:|---:|
| PDF (encode already in a worker) | 15.0 s | 367 ms | 8,549 ms | 52 |
| **PowerPoint, before** | 19.2 s | **717 ms** | **10,769 ms** | 65 |
| **PowerPoint, after** | 19.1 s | **383 ms** | **8,445 ms** | 53 |

Two things fall out of the first two rows. The **per-slide** stalls are the same in
both — the PDF's worst is 367 ms and PowerPoint's per-slide stalls top out at 350 ms
— so the encode is not the problem; that number is `html-to-image`'s clone + draw,
which needs the DOM and cannot move anywhere. And PowerPoint carried one 717 ms
freeze the PDF does not: the TAIL, where pptxgenjs generates an XML part per slide,
JSZip base64-decodes every image into the archive, and the zip is written — none of
it yielding.

The third row is the point: PowerPoint now sits ON the PDF's floor. Every
PowerPoint-specific stall is gone, and what remains is the clone + draw both lanes
share.

## What ships

`pptx-assemble-worker.js` builds the whole document. The main thread keeps what needs
the DOM — the capture frame, the clone, the draw — and hands each slide over as raw
PNG **bytes**, transferred.

Three choices worth recording:

- **The bytes, not a data URL.** pptxgenjs validates its `data` for a `base64,`
  marker, so something has to base64 fifty-six multi-megabyte images. An ArrayBuffer
  transfers to the worker for free; a data-URL string would be copied whole, on the
  thread we are trying to free. So the encode happens in the worker, where it is not
  in anyone's way.
- **`write({ outputType: 'blob' })`, not `writeFile`.** pptxgenjs touches no DOM on
  this path except inside `writeFile`, which builds an anchor to trigger the download.
  `write` is the same export with the download left to the caller — which is the main
  thread's job anyway.
- **The same backpressure window as the PDF lane (2).** Each queued slide is a full
  PNG, and an unbounded queue grows with however far the worker falls behind the
  clone + draw.

The main-thread build stays as the fallback, for a browser with no `Worker` and for
the case where the worker dies mid-deck: the deck must never be lost to the fast lane.

## How it was verified

| Claim | Evidence |
|---|---|
| The freeze is gone | The table above. Longest frame gap 717 → 383 ms; total blocked 10,769 → 8,445 ms over 65 → 53 stalls. Both baselines reproduce (19.1 s / 733 ms and 18.9 s / 767 ms on two consecutive runs) |
| It is the tail that moved, not the encode | The PDF's own numbers are the control: its encode ALREADY runs in a worker and it blocks 8,549 ms over 52 stalls. PowerPoint after is 8,445 / 53 — the same export shape, within noise |
| The file is unchanged | Before and after, same 56-slide deck: all 56 `ppt/media/*.png` entries **byte-identical**, and every other zip entry identical except `docProps/core.xml`, which carries the creation timestamp |
| The two lanes agree | `docs/e2e/pptx-export-worker.spec.ts` exports the same deck through the worker and through the main-thread fallback (worker script aborted) and compares every `ppt/media` entry by size and CRC out of the zip's central directory. The four slides are asserted distinct first, so the comparison cannot pass on a permutation. **Mutation-proved**: reversing the worker's slide order fails it |
| Nothing else regressed | `npm run lint`, `tsc`, the docs export unit suite, `build:check` |

## What this is NOT

- **Not the image set.** Its encode is `canvas.toBlob`, which is already async, and
  JSZip's deflate is chunked — 16 KB a tick, rescheduled through `setImmediate`
  (`jszip/lib/stream/DataWorker.js`, read rather than assumed) — so it stutters where
  PowerPoint froze. It has no bench arm yet and is unmeasured; that is the honest
  state, not a claim that it is fine.
- **Not a floor anyone should be happy with.** 8.4 s of a 19 s export is still time
  the tab cannot paint, and it is the clone + draw in both lanes. Moving THAT needs
  the capture to stop going through `html-to-image`'s SVG `foreignObject` round trip,
  which is a different change entirely.
- **Not verified on a real phone.** Headless desktop Chromium only (HARD RULE #23).
  The memory picture is within noise (1,232 → 1,262 MB peak), which is the number that
  would have made a phone the deciding surface.
