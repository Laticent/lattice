- **Fixed: `build:check` no longer claims to have checked artifacts it skipped.** It runs
  with `--exclude-uncommitted`, so the 28 built-not-committed artifacts (`dist/`, the
  docs-site bundles) are out of its scope by design — but its closing line read "all
  artifacts up to date" anyway, contradicting its own opening line. It now names the scope
  it measured and points at `npm run build:check:all` for the rest.
- **Fixed: a `dist/` file that is a verbatim COPY of a committed source is now compared.**
  The agent kit ships the six hand-written `design/skills/*.md` byte-for-byte, and a stale
  local `dist/` let them drift while the gate reported everything current — costing one
  session a detour into two unit failures their branch never touched. `checkVerbatimDistCopies`
  in the ownership guard covers all three copy shapes (the skills, the embedded fonts into
  two kits, and eight one-off pairs), skips when `dist/` is absent, and fires only under
  `--check` so a plain `npm run build` can still repair the drift.
