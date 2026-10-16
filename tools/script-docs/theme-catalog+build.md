---
group: Build & bundle
---
Generate docs/src/lib/theme-catalog.generated.ts — the palette picker's groups (tier/order) and swatches, baked from themes/*.manifest.json so the docs bundle gets the one scope declaration without fs-loading 32 manifests at runtime. Replaces two hand-kept lists a test had to reconcile.
