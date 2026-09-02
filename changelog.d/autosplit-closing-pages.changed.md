- **Changed: `progress` and `timeline-list` are recorded as whole-slide layouts**, not candidates
  for splitting. Both look sliceable — clean repeated blocks in the rendered DOM — and neither is:
  a progress chart's bars share one baseline and the comparison between them is the read, and a
  timeline's spine is a single rail across the whole set whose dot colors are picked by position,
  so one milestone per page draws a rule to nowhere under a dot that is always the first color.
  Nothing changes in any deck; the reasons are now on the record so the next sweep does not enroll
  them on the strength of their markup. `split-compare` was examined and declined for its own
  reason: it holds exactly two options by contract, and its verdict card would repeat on both.
