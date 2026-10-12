---
group: Build & bundle
---
Generate ONLY the built-not-committed artifacts (dist/, the docs-site bundles). The cold-tree bootstrap: the ownership guard reads dist/ CSS, so it cannot run before this. Skips the guard for that reason.
