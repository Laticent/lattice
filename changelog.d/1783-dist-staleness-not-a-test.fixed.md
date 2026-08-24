- **Fixed: a rebase no longer blocks the push with a "lattice.css is stale"
  failure.** `build-css.test.js` compared `dist/lattice.css` on disk against
  `bundle()`. Since #1742 gitignored `dist/`, that file is whatever the last
  local build wrote, so the test asserted how recently someone had built rather
  than anything about the source tree — vacuous in CI, which full-builds first,
  and spuriously red locally after the rebase HARD RULE #16 requires before every
  push. It is replaced by the two properties that make the comparison
  unnecessary: `bundle()` reads only sources, never the repo's own `dist/`, and
  it is deterministic. `--only-uncommitted` was never a second producer — it and
  a full build emit byte-identical CSS from the same sources. The end-to-end
  check moves to `build:check:all` in CI's `unit` job after the build, which also
  gives that script its first caller.
