---
marp: true
theme: indaco
---

<style>
/* Force slide 2's list to overshoot its stage by a known amount that lands INSIDE
 * the fit tolerance: above NEAR_MISS_FLOOR (3) so the advisory names it, at or below
 * FRAME_TOLERANCE (12) so no other warning line prints. The overshoot is EMPTY SPACE,
 * not text, which is deliberate — it keeps `probeContentClipped` at cut:false so the
 * `CONTENT CLIPPED` warning line stays silent too. What is left in the buffer is the
 * advisory and nothing else, which is the shape this fixture exists to produce. */
section[data-lattice-slide="2"] .cell-stage > ul { min-height: 430px; }
</style>

<!-- _class: title silent -->

# A deck whose only finding is a near miss.

---

<!-- _class: content -->

## One list, padded past its stage by empty space.

- First
  - Nothing here crosses a box edge.
- Second
  - The overshoot is the `min-height` above, not the words.
