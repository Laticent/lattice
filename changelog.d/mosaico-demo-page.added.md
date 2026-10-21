- **Added: the Mosaico demo page shows more than the two strategies.** Five one-click sets show
  what each strategy does, including one where the search takes margin rather than shrink a box to a
  sliver. The live CSS grid that `toGrid()` returns for the current layout, a speed test that runs
  in the reader's browser, Lattice's two layouts before and after, and a comparison with diorama and
  justified-layout follow. The page and the Learn page now say what the `tree` search keeps: the
  least empty space and crop, with a penalty on boxes that shrink to slivers, not simply the least
  empty space. The README's CSS recipe now scales the `fr` tracks by 1000, because row tracks sum
  below 1 and a grid with `fr` factors under 1 leaves part of its height empty.
