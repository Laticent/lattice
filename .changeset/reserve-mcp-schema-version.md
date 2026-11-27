---
"@laticent/lattice": minor
---

`lattice mcp` now says the MCP server is not available in this version, and the component catalog carries a version number that tools can check.

- `lattice mcp` prints one line with a link to the CLI reference and exits 1. Before, it read `mcp` as a deck file. Tab completion and both help screens list it. A deck file named `mcp` renders as `lattice ./mcp`.
- `dist/docs/components.json` starts with `"schemaVersion": 1`. A new field keeps the version; removing or renaming a field, or changing what one means, bumps it.
