- **Changed: every regular expression in `lib/**` now carries a complexity verdict, and the build fails on a new slow
  one.** `build:check` holds each regex literal to `tools/regex-census.json`, where the `recheck` checker recorded
  whether it runs in linear time, and holds each file's count of slow patterns so it can only shrink. A new pattern
  is decided with `npm run regex:census -- --write`, which refuses one that would add to a file's slow count.
  recheck is pinned in its own folder, `tools/recheck/`, so installing Lattice does not pull it in.
- **Changed: the slide map stamps the scroll offset its tiles were planned for** (`data-plan-at` on the rail's
  scroller), once that plan is on the page. A tile's `data-tier` follows a scroll one frame later, so a script that
  reads the tiers right after scrolling now has something to wait on.
