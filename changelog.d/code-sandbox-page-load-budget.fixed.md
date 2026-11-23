- **A code package's load limit now bounds only the package.** The export sandbox gave the same time
  limit to its own page's load and to the package's top-level code. On a busy machine with a short
  limit, the page's load ran out first and the error named a browser navigation timeout instead of
  the package. The page now keeps its own 5-second limit.
