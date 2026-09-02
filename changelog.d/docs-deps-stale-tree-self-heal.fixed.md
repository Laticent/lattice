- **Fixed: a stale `docs/node_modules` in a web session no longer breaks the docs
  build.** `.claude/hooks/session-start.sh` gated its docs install on the astro
  binary merely existing, and every astro version ships one — so on a warm
  container carrying a tree installed against an older `docs/package.json`, the
  gate read "already installed" and skipped the repair it was there to do. The
  next `cd docs && npm run build` then died at config load on
  `@astrojs/markdown-remark does not provide an export named 'unified'`, naming
  neither the staleness nor astro. The install now runs unconditionally
  (`--no-save`, so it reconciles the tree without rewriting
  `docs/package-lock.json`) and is bounded at 180s, since npm burns ~73s of
  fetch-retry backoff when it needs the network and cannot reach it. Measured:
  ~2.4s on a current tree, ~4s to heal a stale one. Web sessions only — the hook
  deliberately exits early on a local checkout.
