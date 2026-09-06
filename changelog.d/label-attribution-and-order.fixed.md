- **Fixed: a `quadrant` name now says which dot it belongs to.** On the
  fourteen-initiative stress slide, six of the fourteen names sat closer to
  another initiative's dot than to their own, and the chart carried no leader
  lines — so proximity, its only attribution channel, gave the wrong answer six
  times. The leader emitter `scatter` already had moved into the shared label
  kernel and `quadrant` now draws it too: a hairline from a name that had to
  travel, back to the mark it names. Nothing is drawn where a label already sits
  against its own dot, so an ordinary quadrant is unchanged — and nothing is
  drawn where the line would have to pass through a neighbor's name, because a
  hairline through someone else's letterforms points the reader at the wrong
  entity.
- **Fixed: a column of chart labels no longer reads against the dots it
  labels.** `placeLabels` was greedy in authoring order, so a name authored
  first took the best position and a later one could end up painted above a mark
  that sits below it. Measured over 20,000 randomized layouts, 18.61% of
  the label pairs sharing a column read against their own marks, and 6.33% did
  so with marks a reader can plainly separate; the two fall to 6.04% and 2.50%.
  The order is bought with a different anchor, never by dropping or overprinting
  a name — the same corpus drops six fewer names than before.
- **Changed: the leader hairline is now `.chart-leader`, painted once for the
  whole chart family.** `scatter` emitted `.scatter-leader` from its own
  stylesheet; the class and its one rule now live in `chart-family.css` so both
  charts draw the same mark. Deck CSS targeting `.scatter-leader` should target
  `.chart-leader`.
