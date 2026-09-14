- **Fixed: the render-latency note's summary described a design that never shipped.** Its
  frontmatter — the first thing a reader sees, and the part that says "read §15 first" — claimed
  `waitForDiagrams` "now waits on PROGRESS rather than a 4000ms wall clock". It does not, and §15
  of the same document records the trio killing that design: the function is a plain
  `while (Date.now() - start < budgetMs)` wall clock. What actually shipped is the RELEASE at the
  give-up point. The §13 paragraph making the same claim now carries a retraction marker, which its
  three siblings already had, and the retraction count is four rather than three — the list under
  it always had four bullets.
