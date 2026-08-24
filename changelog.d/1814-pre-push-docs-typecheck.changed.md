- **Changed: the pre-push hook now typechecks the docs workspace.** A new
  `docs-typecheck` job runs `tsc --noEmit` over `docs/` whenever a push touches
  `docs/` files, and skips otherwise. A docs type error used to pass every local
  gate — biome does not typecheck, and vitest strips types via esbuild without
  checking them — so it first appeared as a red required check in CI. The job is
  scoped rather than unconditional so an engine- or deck-only push does not pay
  its ~36s; a root-`lib/` change that breaks docs types is still caught by CI's
  `docs-build` rather than locally.
