- **The capability, decision and gotcha indexes are generated into `dist/engineering/` and no
  longer committed.** `npm install`, the SessionStart hook and `npm run build` write
  `dist/engineering/capabilities.md`, `decisions.md` and `gotchas.md` from their one-file-per-item
  sources, so two PRs that each add a tool, a decision note or a gotcha no longer rewrite the
  same file. 23 of the last 50 commits rewrote at least one of the three committed copies.
  `capabilities:check`, `decisions:index:check` and `gotchas:index:check` now validate the
  sources and still run inside `build:check`. `engineering/decisions/README.md` and
  `engineering/gotchas.md` keep their hand-written guidance. The `dist-kits` branch carries a
  copy for reading on github.com, and the npm package leaves the folder out.
