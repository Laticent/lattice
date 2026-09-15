- **Fixed: `build:check` no longer claims to have checked artifacts it skipped.** It runs
  with `--exclude-uncommitted`, so the 28 built-not-committed artifacts (`dist/`, the
  docs-site bundles) are out of its scope by design — but its closing line read "all
  artifacts up to date" anyway, contradicting its own opening line. It now names the scope
  it measured and points at `npm run build:check:all` for the rest.
- **Fixed: a `dist/` file that is a verbatim COPY of a committed source is now compared by
  the gate, not only by the unit suite.** The agent kit ships the seven hand-written
  `design/skills/*.md` byte-for-byte, and a stale local `dist/` let them drift while the gate
  reported everything current — costing one session a detour into two unit failures their
  branch never touched. `checkVerbatimDistCopies` in the ownership guard covers all 49 copies
  in three shapes (the skills, the embedded fonts into two kits, and eight one-off pairs),
  skips when `dist/` is absent, and fires only under `--check` so a plain `npm run build` can
  still repair the drift. 31 of the 49 were already pinned in the unit tier; the gain is the
  other 18 and, mostly, learning it at pre-push instead of 95 seconds later.
