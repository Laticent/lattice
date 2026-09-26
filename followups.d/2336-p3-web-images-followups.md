---
origin: 2336
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2387
---

# Web images: what the adversarial trio raised and PR #2387 left open

Spec: the 2026-09-26 revision at the top of
`engineering/decisions/2026-09-01-export-remote-subresource-posture.md`. Every item below fails
CLOSED (an image stays blocked, or a choice stays in place longer than it needs to); none lets a
web image load that the reader did not allow.

```text
why now   — found by the red team, inversion and checker on #2387; each is a refinement of the
            switch, not a leak, so it was recorded rather than folded in.
done when — each item is fixed or explicitly declined in the decision record.
evidence  — a failing test before each fix.
verify    — unit + docs/e2e/web-images.spec.ts.
```

1. **No notice at export time.** An author who ignored the strip exports a PDF with placeholders
   and nothing in the Share sheet says so. One line in the Share sheet when the deck has blocked
   web images would close it (inversion #4).
2. **An allowed site outlives the image that asked for it.** Once `images.example.com` is allowed,
   a later paste pointing at the same host loads without asking, and the grant stays after the
   image is deleted. Pruning allowed origins the deck no longer references, on save, would narrow
   it (inversion #6).
3. **Two tabs drift.** There is no `storage` listener, so "Block again" in one tab leaves another
   tab loading and exporting the images until it switches decks (inversion #8).
4. **A `<video>` whose only web address sits on a child `<source>`** gets no hatch: the source
   loses its address, but the video element is not marked (checker #10).
5. **The single-slide renderer's `|W:` sig** has no unit test of its own; the e2e spec covers it
   end to end (checker #10).
