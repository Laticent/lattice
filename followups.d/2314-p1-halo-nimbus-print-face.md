---
origin: 2314
priority: P1
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Restore the accent on halo and nimbus in print/PDF export

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the committed finish-backdrops.pdf shows no accent on either slide; a shipped finish is broken on its export face.
where     — lib/base/base.finish.css (halo, nimbus --fin-edge-opaque and the stacked mesh blooms); docs/src/components/studio/finish-generate.ts:344 (same pattern).
done when — only the bottom full-bleed layer ends on --fin-canvas; the PDF shows the wash; export sign-off given.
evidence  — pixel sample of the re-rendered PDF, before/after, dark + light.
verify    — export change — needs the owner's sign-off with dark + light renders (Quality Bar).
```
