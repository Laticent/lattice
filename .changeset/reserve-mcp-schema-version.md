---
"@laticent/lattice": patch
---

`lattice mcp` is now a reserved command, and `components.json` carries a `schemaVersion`, so neither changes shape after 1.0.

- `lattice mcp` prints that the MCP server is not available in this version, links the CLI reference and exits 1. Tab completion and both help screens list it. A deck file named `mcp` renders as `lattice ./mcp`.
- `dist/docs/components.json` starts with `"schemaVersion": 1`. A new field keeps the version; removing or renaming a field bumps it.
