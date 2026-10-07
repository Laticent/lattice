- **Fixed: a PR that only adds an npm script no longer reads as a dependency change in the
  golden before/after comment.** `tools/golden-diff.mjs` treated any `package.json` edit as a
  dependency bump, so it rendered every gallery and skipped the base render that separates
  "this PR moved it" from "stale on main". #2583 added one `scripts` line and its comment
  listed 46 changed slides. `golden-affected.mjs` now drops a `package.json` edit confined to
  inert keys (`scripts`, `description`, `keywords` and other metadata) before either rule
  reads it. On #2583's own diff the render scope goes from `shared` (20 galleries rendered,
  69 left to the cap) to `none`. A dependency, `version`, `exports` or lockfile change still
  counts.
