- **Fixed: every node in a mindmap branch now takes that branch's color, whatever its shape.**
  The position cycle that colors sankey, flowchart, state and ER nodes also caught mindmap
  `[square]` and `(rounded)` nodes and painted them by their order in the markup. Circle,
  bang, cloud and hexagon nodes lost to the flowchart default and painted blue. That cycle
  now skips mindmap, and the per-branch rule outranks the flowchart default for every shape,
  including the hand-drawn shapes under `mode: sketch`.
- **Fixed: a mindmap with more than five branches keeps coloring its branches.** Node fills
  ran through `section-4` only, so the sixth branch fell back to blue. They now run through
  all twelve categories, on the same map as the branch lines.
- **Fixed: a mindmap branch line now matches its boxes.** Each line took the category's
  `--cat-N-mark`, which is not the fill's hue (a sand branch drew a maroon line), and on a
  dark slide it washed out to near-white. The line now keeps its branch fill's hue: darker
  than the boxes on a light slide, lighter on a dark one.
- **Fixed: the mindmap root no longer blends into the first branch.** The root takes the
  deck accent with its paired `--on-accent` ink instead of `--cat-1`, the first branch's
  color.
