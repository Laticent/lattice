---
group: Build & bundle
---
Bundle the chart-motion (Anima) player as an injectable string constant (it cannot `import`) for the standalone HTML player — the CLI `--player` path via lib/export/player-core.mjs and the Studio share-export. It HYDRATES an already-built scene spec; the scene itself is built by chartToScene in docs/src/lib/chart-anima.ts, which the docs-site preview runs from source through Vite rather than from this bundle.
