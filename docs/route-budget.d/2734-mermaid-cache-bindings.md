studio: +64
playground: +32
The Mermaid change lives in the preview runtime (lib/plugins/mermaid/mermaid.hydrate.js, bundled into dist/lattice-runtime.js), which runs in the preview frame rather than in either route's startup JavaScript, so no feature code joins an eager bundle. The few bytes each route moves were not traced to a line; they read as gzip spread. Measured locally against origin/main c0231d5: studio +3 B gz, playground -2 B; CI read studio +10 B on this PR's first head and playground +1 B (studio -4 B) on its second, so the declared figures cover the spread in both directions.
