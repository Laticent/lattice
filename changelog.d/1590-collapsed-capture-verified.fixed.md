- **Verified (no behavior change): a Playground snapshot captured while the preview pane is
  COLLAPSED cannot put an oversized slide on screen.** The one input shape #1581 reasoned
  about and never ran. Driven through the real controls — collapse the pane, force a render
  and the leave-capture, expand, reload — the capture returns null and the previous good
  snapshot is untouched (its `ts` is unchanged), and the reload replays that good snapshot
  onto the live filmstrip within 0.05px. **Two independent guards, not one:**
  `.pg-preview-wrap` sits inside the `.pg-pane-inner` a collapsed pane hides, so the box
  measures 0x0 — and the preview iframe has no layout under a `display:none` ancestor, so the
  slide inside it measures 0x0 too. Neutering either one on its own still refuses. Pinned by
  an e2e case that drives the whole sequence and a unit case for the zero-size box; the e2e
  case is confirmed to fail when `measureFit` is made to hand back a rail-sized fit. (#1590)
