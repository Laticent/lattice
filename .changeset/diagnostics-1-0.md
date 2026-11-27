---
"@laticent/lattice": minor
---

`lint:deck --json` now reports in the Diagnostic Protocol 1.0 shape: a `version`, the `scope` it checked and the LFM parts it covered, beside the findings.

Every front-matter finding now reports `slide: 0`; `autosplit-retired`, `note-key-retired` and `pagination-unsupported-value` reported `slide: 1`. A renamed-key finding (`key-renamed`) carries `replacement: { from, to }`, so a tool renames the key without reading the message. The finding and report shape is published as `spec/diagnostics.schema.json`.
