studio: +61
playground: +87
The Playground split constants moved to the Studio pair's numbers (`PG_SPLIT_MIN` 300/300, `PG_SPLIT_DEFAULTS` 46:54), and `PlaygroundApp` now reads `PG_SPLIT_DEFAULTS` instead of two string literals (+26 B in `PlaygroundIsland`). The extra +61 B lands in `mode-catalog`, which bundles `pg-split.ts` into both routes; the P2 restore flag and its per-run token in `use-resizable-split.ts` add the rest. Read from the CI measurement against main fe22429, not a local build.
